/**
 * Notification Service
 * Comprehensive notification system supporting in-app, email, and push notifications
 * with preferences, queuing, batching, and real-time delivery
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type NotificationCategory =
  | 'clinical'
  | 'administrative'
  | 'billing'
  | 'scheduling'
  | 'compliance'
  | 'inventory'
  | 'patient'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationChannel = 'in_app' | 'email' | 'push' | 'sms';

export type QueueStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: NotificationPriority;
  sourceType?: string;
  sourceId?: string;
  actionUrl?: string;
  actionLabel?: string;
  expiresAt?: Date;
}

export interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  data: Record<string, any>;
  priority: NotificationPriority;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  sourceType: string | null;
  sourceId: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  createdAt: Date;
}

export interface NotificationFilters {
  category?: NotificationCategory;
  priority?: NotificationPriority;
  unreadOnly?: boolean;
  includeExpired?: boolean;
  includeDismissed?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  category: NotificationCategory;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  minPriority: NotificationPriority;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string | null;
  deviceName: string | null;
}

export interface EmailTemplate {
  id: string;
  tenantId: string;
  templateName: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  variables: string[];
  isActive: boolean;
  description: string | null;
}

export interface QueuedNotification {
  id: string;
  tenantId: string;
  notificationType: string;
  recipientType: 'user' | 'role' | 'patient' | 'custom';
  recipientId: string | null;
  channel: NotificationChannel;
  payload: Record<string, any>;
  scheduledAt: Date;
  sentAt: Date | null;
  status: QueueStatus;
  error: string | null;
  attempts: number;
}

export interface NotificationBatch {
  id: string;
  tenantId: string;
  name: string;
  notificationType: string;
  recipients: string[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'scheduled' | 'processing' | 'completed' | 'cancelled';
  scheduledAt: Date | null;
  completedAt: Date | null;
}

export interface NotificationTrigger {
  id: string;
  triggerEvent: string;
  name: string;
  category: NotificationCategory;
  recipientType: 'user' | 'role' | 'dynamic';
  recipientValue: string;
  titleTemplate: string;
  messageTemplate: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  conditions: Record<string, any> | null;
  isActive: boolean;
}

// WebSocket connections map (populated by websocket server)
const userConnections: Map<string, Set<any>> = new Map();

// ============================================================================
// CORE NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Create a new notification for a user
 */
export async function createNotification(
  tenantId: string,
  params: CreateNotificationParams
): Promise<Notification> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO notifications (
      id, tenant_id, user_id, type, category, title, message, data,
      priority, source_type, source_id, action_url, action_label, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING
      id, tenant_id as "tenantId", user_id as "userId", type, category,
      title, message, data, priority, read_at as "readAt",
      dismissed_at as "dismissedAt", expires_at as "expiresAt",
      source_type as "sourceType", source_id as "sourceId",
      action_url as "actionUrl", action_label as "actionLabel",
      created_at as "createdAt"`,
    [
      id,
      tenantId,
      params.userId,
      params.type,
      params.category,
      params.title,
      params.message,
      JSON.stringify(params.data || {}),
      params.priority || 'normal',
      params.sourceType || null,
      params.sourceId || null,
      params.actionUrl || null,
      params.actionLabel || null,
      params.expiresAt || null,
    ]
  );

  const notification = result.rows[0];

  // Broadcast to user's active connections
  broadcastToUser(params.userId, 'notification:new', notification);

  logger.info('Notification created', {
    notificationId: id,
    userId: params.userId,
    type: params.type,
    category: params.category,
  });

  return notification;
}

/**
 * Get notifications for a user with filters
 */
export async function getNotifications(
  tenantId: string,
  userId: string,
  filters: NotificationFilters = {}
): Promise<{ notifications: Notification[]; total: number }> {
  const whereClauses: string[] = ['tenant_id = $1', 'user_id = $2'];
  const params: any[] = [tenantId, userId];
  let paramIndex = 3;

  // Category filter
  if (filters.category) {
    whereClauses.push(`category = $${paramIndex}`);
    params.push(filters.category);
    paramIndex++;
  }

  // Priority filter
  if (filters.priority) {
    whereClauses.push(`priority = $${paramIndex}`);
    params.push(filters.priority);
    paramIndex++;
  }

  // Unread only filter
  if (filters.unreadOnly) {
    whereClauses.push('read_at IS NULL');
  }

  // Exclude dismissed unless requested
  if (!filters.includeDismissed) {
    whereClauses.push('dismissed_at IS NULL');
  }

  // Exclude expired unless requested
  if (!filters.includeExpired) {
    whereClauses.push('(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)');
  }

  // Date range filters
  if (filters.startDate) {
    whereClauses.push(`created_at >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    whereClauses.push(`created_at <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  const whereClause = whereClauses.join(' AND ');
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Get total count
  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM notifications WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get notifications
  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", user_id as "userId", type, category,
      title, message, data, priority, read_at as "readAt",
      dismissed_at as "dismissedAt", expires_at as "expiresAt",
      source_type as "sourceType", source_id as "sourceId",
      action_url as "actionUrl", action_label as "actionLabel",
      created_at as "createdAt"
    FROM notifications
    WHERE ${whereClause}
    ORDER BY
      CASE priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { notifications: result.rows, total };
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(
  tenantId: string,
  userId: string,
  category?: NotificationCategory
): Promise<{ total: number; byCategory: Record<string, number>; byPriority: Record<string, number> }> {
  const baseWhere = 'tenant_id = $1 AND user_id = $2 AND read_at IS NULL AND dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)';
  const params: any[] = [tenantId, userId];

  // Total count with optional category filter
  let totalQuery = `SELECT COUNT(*) as count FROM notifications WHERE ${baseWhere}`;
  if (category) {
    totalQuery += ' AND category = $3';
    params.push(category);
  }

  const totalResult = await pool.query(totalQuery, params);
  const total = parseInt(totalResult.rows[0].count, 10);

  // Count by category
  const categoryResult = await pool.query(
    `SELECT category, COUNT(*) as count
     FROM notifications
     WHERE ${baseWhere}
     GROUP BY category`,
    [tenantId, userId]
  );

  const byCategory: Record<string, number> = {};
  for (const row of categoryResult.rows) {
    byCategory[row.category] = parseInt(row.count, 10);
  }

  // Count by priority
  const priorityResult = await pool.query(
    `SELECT priority, COUNT(*) as count
     FROM notifications
     WHERE ${baseWhere}
     GROUP BY priority`,
    [tenantId, userId]
  );

  const byPriority: Record<string, number> = {};
  for (const row of priorityResult.rows) {
    byPriority[row.priority] = parseInt(row.count, 10);
  }

  return { total, byCategory, byPriority };
}

/**
 * Mark a notification as read
 */
export async function markAsRead(
  tenantId: string,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications
     SET read_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND read_at IS NULL
     RETURNING id`,
    [notificationId, tenantId, userId]
  );

  if (result.rowCount && result.rowCount > 0) {
    broadcastToUser(userId, 'notification:read', { notificationId });
    return true;
  }

  return false;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(
  tenantId: string,
  userId: string,
  category?: NotificationCategory
): Promise<number> {
  let query = `
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL
  `;
  const params: any[] = [tenantId, userId];

  if (category) {
    query += ' AND category = $3';
    params.push(category);
  }

  query += ' RETURNING id';

  const result = await pool.query(query, params);
  const count = result.rowCount || 0;

  if (count > 0) {
    broadcastToUser(userId, 'notification:readAll', { category, count });
  }

  return count;
}

/**
 * Dismiss a notification (hide it without deleting)
 */
export async function dismissNotification(
  tenantId: string,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications
     SET dismissed_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND dismissed_at IS NULL
     RETURNING id`,
    [notificationId, tenantId, userId]
  );

  if (result.rowCount && result.rowCount > 0) {
    broadcastToUser(userId, 'notification:dismissed', { notificationId });
    return true;
  }

  return false;
}

/**
 * Delete a notification permanently
 */
export async function deleteNotification(
  tenantId: string,
  notificationId: string,
  userId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM notifications
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     RETURNING id`,
    [notificationId, tenantId, userId]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Clear expired notifications (cleanup job)
 */
export async function clearExpired(tenantId?: string): Promise<number> {
  let query = `DELETE FROM notifications WHERE expires_at < CURRENT_TIMESTAMP`;
  const params: any[] = [];

  if (tenantId) {
    query += ' AND tenant_id = $1';
    params.push(tenantId);
  }

  query += ' RETURNING id';

  const result = await pool.query(query, params);
  const count = result.rowCount || 0;

  if (count > 0) {
    logger.info('Cleared expired notifications', { count, tenantId });
  }

  return count;
}

// ============================================================================
// DELIVERY FUNCTIONS
// ============================================================================

/**
 * Send in-app notification (creates notification record and broadcasts)
 */
export async function sendInApp(
  tenantId: string,
  userId: string,
  notification: Omit<CreateNotificationParams, 'userId'>
): Promise<Notification> {
  return createNotification(tenantId, { ...notification, userId });
}

/**
 * Send email notification using a template
 */
export async function sendEmail(
  tenantId: string,
  userId: string,
  templateName: string,
  variables: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get template
    const templateResult = await pool.query(
      `SELECT * FROM email_templates
       WHERE tenant_id = $1 AND template_name = $2 AND is_active = true`,
      [tenantId, templateName]
    );

    if (templateResult.rowCount === 0) {
      return { success: false, error: 'Template not found' };
    }

    const template = templateResult.rows[0];

    // Get user email
    const userResult = await pool.query(
      `SELECT email, full_name FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rowCount === 0) {
      return { success: false, error: 'User not found' };
    }

    const user = userResult.rows[0];

    // Replace template variables
    let subject = template.subject;
    let htmlContent = template.html_content;
    let textContent = template.text_content || '';

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      subject = subject.replace(regex, value);
      htmlContent = htmlContent.replace(regex, value);
      textContent = textContent.replace(regex, value);
    }

    // Queue the email for sending
    await queueNotification(tenantId, {
      notificationType: 'email',
      recipientType: 'user',
      recipientId: userId,
      channel: 'email',
      payload: {
        to: user.email,
        toName: user.full_name,
        subject,
        htmlContent,
        textContent,
        templateName,
      },
    });

    logger.info('Email queued', {
      userId,
      templateName,
      recipient: user.email,
    });

    return { success: true };
  } catch (error: any) {
    logger.error('Failed to send email', {
      error: error.message,
      userId,
      templateName,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification
 */
export async function sendPush(
  tenantId: string,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  try {
    // Get user's push subscriptions
    const subscriptions = await pool.query(
      `SELECT * FROM push_subscriptions WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );

    if (subscriptions.rowCount === 0) {
      return { success: false, sentCount: 0, error: 'No push subscriptions found' };
    }

    let sentCount = 0;

    for (const sub of subscriptions.rows) {
      // Queue push notification for each subscription
      await queueNotification(tenantId, {
        notificationType: 'push',
        recipientType: 'user',
        recipientId: userId,
        channel: 'push',
        payload: {
          endpoint: sub.endpoint,
          keys: sub.keys,
          notification: {
            title,
            body,
            data,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
          },
        },
      });
      sentCount++;
    }

    logger.info('Push notifications queued', {
      userId,
      subscriptionCount: sentCount,
    });

    return { success: true, sentCount };
  } catch (error: any) {
    logger.error('Failed to send push', {
      error: error.message,
      userId,
    });
    return { success: false, sentCount: 0, error: error.message };
  }
}

/**
 * Queue a notification for async processing
 */
export async function queueNotification(
  tenantId: string,
  params: {
    notificationType: string;
    recipientType: 'user' | 'role' | 'patient' | 'custom';
    recipientId?: string;
    channel: NotificationChannel;
    payload: Record<string, any>;
    scheduledAt?: Date;
    priority?: number;
  }
): Promise<string> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO notification_queue (
      id, tenant_id, notification_type, recipient_type, recipient_id,
      channel, payload, scheduled_at, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      tenantId,
      params.notificationType,
      params.recipientType,
      params.recipientId || null,
      params.channel,
      JSON.stringify(params.payload),
      params.scheduledAt || new Date(),
      params.priority || 50,
    ]
  );

  return id;
}

/**
 * Process queued notifications
 */
export async function processNotificationQueue(
  batchSize: number = 100
): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Get pending notifications that are due
  const pendingResult = await pool.query(
    `UPDATE notification_queue
     SET status = 'processing', last_attempt_at = CURRENT_TIMESTAMP
     WHERE id IN (
       SELECT id FROM notification_queue
       WHERE status = 'pending'
         AND scheduled_at <= CURRENT_TIMESTAMP
         AND attempts < max_attempts
       ORDER BY priority DESC, scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [batchSize]
  );

  for (const item of pendingResult.rows) {
    processed++;
    try {
      // Process based on channel
      let success = false;
      switch (item.channel) {
        case 'email':
          success = await processEmailQueueItem(item);
          break;
        case 'push':
          success = await processPushQueueItem(item);
          break;
        case 'in_app':
          success = await processInAppQueueItem(item);
          break;
        case 'sms':
          success = await processSmsQueueItem(item);
          break;
      }

      if (success) {
        await pool.query(
          `UPDATE notification_queue
           SET status = 'sent', sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1
           WHERE id = $1`,
          [item.id]
        );
        succeeded++;
      } else {
        throw new Error('Processing returned false');
      }
    } catch (error: any) {
      const newAttempts = (item.attempts || 0) + 1;
      const newStatus = newAttempts >= item.max_attempts ? 'failed' : 'pending';

      await pool.query(
        `UPDATE notification_queue
         SET status = $1, error = $2, attempts = $3
         WHERE id = $4`,
        [newStatus, error.message, newAttempts, item.id]
      );

      if (newStatus === 'failed') {
        failed++;
      }

      logger.error('Failed to process queue item', {
        queueId: item.id,
        channel: item.channel,
        error: error.message,
        attempts: newAttempts,
      });
    }
  }

  if (processed > 0) {
    logger.info('Processed notification queue', { processed, succeeded, failed });
  }

  return { processed, succeeded, failed };
}

// Queue item processors
async function processEmailQueueItem(item: any): Promise<boolean> {
  // In production, integrate with email service (SendGrid, SES, etc.)
  // For now, log the email
  logger.info('Sending email', {
    to: item.payload.to,
    subject: item.payload.subject,
  });

  // TODO: Integrate with actual email service
  // const emailService = getEmailService();
  // await emailService.send(item.payload);

  return true;
}

async function processPushQueueItem(item: any): Promise<boolean> {
  // In production, use web-push library
  logger.info('Sending push notification', {
    endpoint: item.payload.endpoint?.substring(0, 50),
    title: item.payload.notification?.title,
  });

  // TODO: Integrate with web-push
  // const webpush = require('web-push');
  // await webpush.sendNotification(subscription, JSON.stringify(item.payload.notification));

  return true;
}

async function processInAppQueueItem(item: any): Promise<boolean> {
  // Create the in-app notification
  await createNotification(item.tenant_id, {
    userId: item.recipient_id,
    type: item.notification_type,
    category: item.payload.category || 'system',
    title: item.payload.title,
    message: item.payload.message,
    data: item.payload.data,
    priority: item.payload.priority || 'normal',
  });

  return true;
}

async function processSmsQueueItem(item: any): Promise<boolean> {
  // In production, integrate with SMS service (Twilio)
  logger.info('Sending SMS', {
    to: item.payload.to,
    message: item.payload.message?.substring(0, 50),
  });

  // TODO: Integrate with Twilio service
  // const twilioService = getTwilioService();
  // await twilioService.sendSMS(item.payload);

  return true;
}

/**
 * Send notification to multiple users (batch)
 */
export async function sendBatch(
  tenantId: string,
  userIds: string[],
  notification: Omit<CreateNotificationParams, 'userId'>,
  channels: NotificationChannel[] = ['in_app']
): Promise<{ batchId: string; queuedCount: number }> {
  const batchId = crypto.randomUUID();
  let queuedCount = 0;

  // Create batch record
  await pool.query(
    `INSERT INTO notification_batches (
      id, tenant_id, name, notification_type, recipients, recipient_count, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')`,
    [
      batchId,
      tenantId,
      notification.title,
      notification.type,
      JSON.stringify(userIds),
      userIds.length,
    ]
  );

  // Queue notifications for each user and channel
  for (const userId of userIds) {
    for (const channel of channels) {
      await queueNotification(tenantId, {
        notificationType: notification.type,
        recipientType: 'user',
        recipientId: userId,
        channel,
        payload: {
          ...notification,
          batchId,
        },
      });
      queuedCount++;
    }
  }

  logger.info('Batch notifications queued', {
    batchId,
    userCount: userIds.length,
    channels,
    queuedCount,
  });

  return { batchId, queuedCount };
}

// ============================================================================
// PREFERENCES FUNCTIONS
// ============================================================================

/**
 * Get notification preferences for a user
 */
export async function getPreferences(
  tenantId: string,
  userId: string
): Promise<NotificationPreference[]> {
  const result = await pool.query(
    `SELECT
      id, user_id as "userId", category,
      in_app_enabled as "inAppEnabled",
      email_enabled as "emailEnabled",
      push_enabled as "pushEnabled",
      sound_enabled as "soundEnabled",
      min_priority as "minPriority",
      quiet_hours_start as "quietHoursStart",
      quiet_hours_end as "quietHoursEnd"
    FROM notification_preferences
    WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );

  // Return existing preferences, frontend should merge with defaults
  return result.rows;
}

/**
 * Update notification preferences for a user
 */
export async function updatePreferences(
  tenantId: string,
  userId: string,
  preferences: Partial<NotificationPreference>[]
): Promise<NotificationPreference[]> {
  const updated: NotificationPreference[] = [];

  for (const pref of preferences) {
    if (!pref.category) continue;

    const result = await pool.query(
      `INSERT INTO notification_preferences (
        id, tenant_id, user_id, category,
        in_app_enabled, email_enabled, push_enabled, sound_enabled,
        min_priority, quiet_hours_start, quiet_hours_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, user_id, category)
      DO UPDATE SET
        in_app_enabled = COALESCE($5, notification_preferences.in_app_enabled),
        email_enabled = COALESCE($6, notification_preferences.email_enabled),
        push_enabled = COALESCE($7, notification_preferences.push_enabled),
        sound_enabled = COALESCE($8, notification_preferences.sound_enabled),
        min_priority = COALESCE($9, notification_preferences.min_priority),
        quiet_hours_start = COALESCE($10, notification_preferences.quiet_hours_start),
        quiet_hours_end = COALESCE($11, notification_preferences.quiet_hours_end),
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        id, user_id as "userId", category,
        in_app_enabled as "inAppEnabled",
        email_enabled as "emailEnabled",
        push_enabled as "pushEnabled",
        sound_enabled as "soundEnabled",
        min_priority as "minPriority",
        quiet_hours_start as "quietHoursStart",
        quiet_hours_end as "quietHoursEnd"`,
      [
        crypto.randomUUID(),
        tenantId,
        userId,
        pref.category,
        pref.inAppEnabled,
        pref.emailEnabled,
        pref.pushEnabled,
        pref.soundEnabled,
        pref.minPriority,
        pref.quietHoursStart || null,
        pref.quietHoursEnd || null,
      ]
    );

    if (result.rows[0]) {
      updated.push(result.rows[0]);
    }
  }

  return updated;
}

/**
 * Check if a notification should be sent based on user preferences
 */
export async function checkShouldNotify(
  tenantId: string,
  userId: string,
  category: NotificationCategory,
  channel: NotificationChannel,
  priority: NotificationPriority = 'normal'
): Promise<boolean> {
  // Get user preferences for this category
  const result = await pool.query(
    `SELECT * FROM notification_preferences
     WHERE tenant_id = $1 AND user_id = $2 AND category = $3`,
    [tenantId, userId, category]
  );

  // If no preferences set, use defaults (all enabled)
  if (result.rowCount === 0) {
    return true;
  }

  const pref = result.rows[0];

  // Check if channel is enabled
  const channelEnabled =
    (channel === 'in_app' && pref.in_app_enabled) ||
    (channel === 'email' && pref.email_enabled) ||
    (channel === 'push' && pref.push_enabled);

  if (!channelEnabled) {
    return false;
  }

  // Check priority threshold
  const priorityOrder: Record<NotificationPriority, number> = {
    low: 1,
    normal: 2,
    high: 3,
    urgent: 4,
  };

  if (priorityOrder[priority] < priorityOrder[pref.min_priority as NotificationPriority]) {
    return false;
  }

  // Check quiet hours
  if (pref.quiet_hours_start && pref.quiet_hours_end) {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const start = pref.quiet_hours_start;
    const end = pref.quiet_hours_end;

    // Handle quiet hours that span midnight
    if (start > end) {
      if (currentTime >= start || currentTime < end) {
        // Only urgent notifications during quiet hours
        return priority === 'urgent';
      }
    } else {
      if (currentTime >= start && currentTime < end) {
        return priority === 'urgent';
      }
    }
  }

  return true;
}

// ============================================================================
// PUSH SUBSCRIPTION FUNCTIONS
// ============================================================================

/**
 * Register a push subscription
 */
export async function subscribePush(
  tenantId: string,
  userId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
    deviceName?: string;
  }
): Promise<PushSubscription> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO push_subscriptions (
      id, tenant_id, user_id, endpoint, keys, user_agent, device_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, endpoint)
    DO UPDATE SET
      user_id = $3,
      keys = $5,
      user_agent = $6,
      device_name = $7,
      last_used_at = CURRENT_TIMESTAMP
    RETURNING
      id, user_id as "userId", endpoint, keys,
      user_agent as "userAgent", device_name as "deviceName"`,
    [
      id,
      tenantId,
      userId,
      subscription.endpoint,
      JSON.stringify(subscription.keys),
      subscription.userAgent || null,
      subscription.deviceName || null,
    ]
  );

  logger.info('Push subscription registered', {
    userId,
    endpoint: subscription.endpoint.substring(0, 50),
  });

  return result.rows[0];
}

/**
 * Remove a push subscription
 */
export async function unsubscribePush(
  tenantId: string,
  userId: string,
  endpoint: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM push_subscriptions
     WHERE tenant_id = $1 AND user_id = $2 AND endpoint = $3
     RETURNING id`,
    [tenantId, userId, endpoint]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Get push subscriptions for a user
 */
export async function getPushSubscriptions(
  tenantId: string,
  userId: string
): Promise<PushSubscription[]> {
  const result = await pool.query(
    `SELECT
      id, user_id as "userId", endpoint, keys,
      user_agent as "userAgent", device_name as "deviceName"
    FROM push_subscriptions
    WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );

  return result.rows;
}

// ============================================================================
// REAL-TIME (WEBSOCKET) FUNCTIONS
// ============================================================================

/**
 * Register a WebSocket connection for a user
 */
export function registerConnection(userId: string, socket: any): void {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  userConnections.get(userId)!.add(socket);
}

/**
 * Unregister a WebSocket connection
 */
export function unregisterConnection(userId: string, socket: any): void {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(socket);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

/**
 * Broadcast to a specific user's WebSocket connections
 */
export function broadcastToUser(userId: string, event: string, data: any): void {
  const connections = userConnections.get(userId);
  if (connections) {
    for (const socket of connections) {
      try {
        socket.emit(event, data);
      } catch (error) {
        logger.error('Failed to emit to socket', { userId, event, error });
      }
    }
  }
}

/**
 * Broadcast to all users with a specific role
 */
export async function broadcastToRole(
  tenantId: string,
  role: string,
  event: string,
  data: any
): Promise<number> {
  // Get all users with the specified role
  const result = await pool.query(
    `SELECT id FROM users WHERE tenant_id = $1 AND role = $2`,
    [tenantId, role]
  );

  let count = 0;
  for (const user of result.rows) {
    const connections = userConnections.get(user.id);
    if (connections && connections.size > 0) {
      broadcastToUser(user.id, event, data);
      count++;
    }
  }

  return count;
}

// ============================================================================
// EMAIL TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Get email templates
 */
export async function getEmailTemplates(
  tenantId: string,
  activeOnly: boolean = true
): Promise<EmailTemplate[]> {
  let query = `
    SELECT
      id, tenant_id as "tenantId", template_name as "templateName",
      subject, html_content as "htmlContent", text_content as "textContent",
      variables, is_active as "isActive", description
    FROM email_templates
    WHERE tenant_id = $1
  `;

  if (activeOnly) {
    query += ' AND is_active = true';
  }

  query += ' ORDER BY template_name';

  const result = await pool.query(query, [tenantId]);
  return result.rows;
}

/**
 * Get a single email template
 */
export async function getEmailTemplate(
  tenantId: string,
  templateName: string
): Promise<EmailTemplate | null> {
  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", template_name as "templateName",
      subject, html_content as "htmlContent", text_content as "textContent",
      variables, is_active as "isActive", description
    FROM email_templates
    WHERE tenant_id = $1 AND template_name = $2`,
    [tenantId, templateName]
  );

  return result.rows[0] || null;
}

/**
 * Create or update an email template
 */
export async function saveEmailTemplate(
  tenantId: string,
  template: {
    templateName: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    variables?: string[];
    description?: string;
    isActive?: boolean;
  },
  createdBy?: string
): Promise<EmailTemplate> {
  const id = crypto.randomUUID();

  const result = await pool.query(
    `INSERT INTO email_templates (
      id, tenant_id, template_name, subject, html_content, text_content,
      variables, description, is_active, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (tenant_id, template_name)
    DO UPDATE SET
      subject = $4,
      html_content = $5,
      text_content = $6,
      variables = $7,
      description = $8,
      is_active = $9,
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      id, tenant_id as "tenantId", template_name as "templateName",
      subject, html_content as "htmlContent", text_content as "textContent",
      variables, is_active as "isActive", description`,
    [
      id,
      tenantId,
      template.templateName,
      template.subject,
      template.htmlContent,
      template.textContent || null,
      JSON.stringify(template.variables || []),
      template.description || null,
      template.isActive !== false,
      createdBy || null,
    ]
  );

  return result.rows[0];
}

// ============================================================================
// NOTIFICATION TRIGGER FUNCTIONS
// ============================================================================

/**
 * Fire a notification trigger
 */
export async function fireNotificationTrigger(
  tenantId: string,
  triggerEvent: string,
  variables: Record<string, string>,
  recipientUserId?: string
): Promise<{ triggered: boolean; notificationId?: string }> {
  // Get active triggers for this event
  const triggerResult = await pool.query(
    `SELECT * FROM notification_triggers
     WHERE tenant_id = $1 AND trigger_event = $2 AND is_active = true`,
    [tenantId, triggerEvent]
  );

  if (triggerResult.rowCount === 0) {
    return { triggered: false };
  }

  const trigger = triggerResult.rows[0];

  // Determine recipient
  let userId = recipientUserId;

  if (!userId && trigger.recipient_type === 'role') {
    // Get first user with the role (or broadcast to all)
    const userResult = await pool.query(
      `SELECT id FROM users WHERE tenant_id = $1 AND role = $2 LIMIT 1`,
      [tenantId, trigger.recipient_value]
    );
    if (userResult.rowCount && userResult.rowCount > 0) {
      userId = userResult.rows[0].id;
    }
  }

  if (!userId) {
    return { triggered: false };
  }

  // Replace template variables
  let title = trigger.title_template;
  let message = trigger.message_template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    title = title.replace(regex, value);
    message = message.replace(regex, value);
  }

  // Create notification
  const channels: NotificationChannel[] = trigger.channels || ['in_app'];

  for (const channel of channels) {
    // Check user preferences
    const shouldNotify = await checkShouldNotify(
      tenantId,
      userId,
      trigger.category,
      channel,
      trigger.priority
    );

    if (shouldNotify) {
      if (channel === 'in_app') {
        const notification = await createNotification(tenantId, {
          userId,
          type: triggerEvent,
          category: trigger.category,
          title,
          message,
          data: variables,
          priority: trigger.priority,
        });

        return { triggered: true, notificationId: notification.id };
      } else if (channel === 'email') {
        await queueNotification(tenantId, {
          notificationType: triggerEvent,
          recipientType: 'user',
          recipientId: userId,
          channel: 'email',
          payload: {
            subject: title,
            htmlContent: `<p>${message}</p>`,
            textContent: message,
            variables,
          },
        });
      } else if (channel === 'push') {
        await sendPush(tenantId, userId, title, message, variables);
      }
    }
  }

  return { triggered: true };
}

// ============================================================================
// QUEUE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Get queue statistics
 */
export async function getQueueStats(tenantId: string): Promise<{
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  byChannel: Record<string, number>;
}> {
  const statusResult = await pool.query(
    `SELECT status, COUNT(*) as count
     FROM notification_queue
     WHERE tenant_id = $1
     GROUP BY status`,
    [tenantId]
  );

  const stats: Record<string, number> = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
  };

  for (const row of statusResult.rows) {
    stats[row.status] = parseInt(row.count, 10);
  }

  const channelResult = await pool.query(
    `SELECT channel, COUNT(*) as count
     FROM notification_queue
     WHERE tenant_id = $1 AND status = 'pending'
     GROUP BY channel`,
    [tenantId]
  );

  const byChannel: Record<string, number> = {};
  for (const row of channelResult.rows) {
    byChannel[row.channel] = parseInt(row.count, 10);
  }

  return {
    pending: stats.pending || 0,
    processing: stats.processing || 0,
    sent: stats.sent || 0,
    failed: stats.failed || 0,
    byChannel,
  };
}

/**
 * Get queue items with filters
 */
export async function getQueueItems(
  tenantId: string,
  filters: {
    status?: QueueStatus;
    channel?: NotificationChannel;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ items: QueuedNotification[]; total: number }> {
  const whereClauses: string[] = ['tenant_id = $1'];
  const params: any[] = [tenantId];
  let paramIndex = 2;

  if (filters.status) {
    whereClauses.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.channel) {
    whereClauses.push(`channel = $${paramIndex}`);
    params.push(filters.channel);
    paramIndex++;
  }

  const whereClause = whereClauses.join(' AND ');
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const countResult = await pool.query(
    `SELECT COUNT(*) as count FROM notification_queue WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT
      id, tenant_id as "tenantId", notification_type as "notificationType",
      recipient_type as "recipientType", recipient_id as "recipientId",
      channel, payload, scheduled_at as "scheduledAt",
      sent_at as "sentAt", status, error, attempts
    FROM notification_queue
    WHERE ${whereClause}
    ORDER BY scheduled_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { items: result.rows, total };
}

/**
 * Cancel a queued notification
 */
export async function cancelQueueItem(
  tenantId: string,
  queueId: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notification_queue
     SET status = 'cancelled'
     WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
     RETURNING id`,
    [queueId, tenantId]
  );

  return (result.rowCount || 0) > 0;
}

// ============================================================================
// EXPORT SERVICE OBJECT
// ============================================================================

export const notificationService = {
  // Core
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  deleteNotification,
  clearExpired,

  // Delivery
  sendInApp,
  sendEmail,
  sendPush,
  queueNotification,
  processNotificationQueue,
  sendBatch,

  // Preferences
  getPreferences,
  updatePreferences,
  checkShouldNotify,

  // Push subscriptions
  subscribePush,
  unsubscribePush,
  getPushSubscriptions,

  // Real-time
  registerConnection,
  unregisterConnection,
  broadcastToUser,
  broadcastToRole,

  // Templates
  getEmailTemplates,
  getEmailTemplate,
  saveEmailTemplate,

  // Triggers
  fireNotificationTrigger,

  // Queue management
  getQueueStats,
  getQueueItems,
  cancelQueueItem,
};

export default notificationService;
