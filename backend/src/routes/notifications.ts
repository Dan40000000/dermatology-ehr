/**
 * Notification Routes
 * API endpoints for the notification system
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import {
  notificationService,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel,
} from '../services/notificationService';

export const notificationsRouter = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const notificationCategorySchema = z.enum([
  'clinical',
  'administrative',
  'billing',
  'scheduling',
  'compliance',
  'inventory',
  'patient',
  'system',
]);

const notificationPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const notificationChannelSchema = z.enum(['in_app', 'email', 'push', 'sms']);

const getNotificationsSchema = z.object({
  category: notificationCategorySchema.optional(),
  priority: notificationPrioritySchema.optional(),
  unreadOnly: z.string().transform((v) => v === 'true').optional(),
  includeExpired: z.string().transform((v) => v === 'true').optional(),
  includeDismissed: z.string().transform((v) => v === 'true').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(100),
  category: notificationCategorySchema,
  title: z.string().min(1).max(500),
  message: z.string().min(1),
  data: z.record(z.string(), z.any()).optional(),
  priority: notificationPrioritySchema.optional(),
  sourceType: z.string().max(100).optional(),
  sourceId: z.string().uuid().optional(),
  actionUrl: z.string().max(500).optional(),
  actionLabel: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

const broadcastSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  type: z.string().min(1).max(100),
  category: notificationCategorySchema,
  title: z.string().min(1).max(500),
  message: z.string().min(1),
  data: z.record(z.string(), z.any()).optional(),
  priority: notificationPrioritySchema.optional(),
  channels: z.array(notificationChannelSchema).optional(),
});

const preferenceSchema = z.object({
  category: notificationCategorySchema,
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
  minPriority: notificationPrioritySchema.optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

const updatePreferencesSchema = z.object({
  preferences: z.array(preferenceSchema).min(1),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
  deviceName: z.string().max(255).optional(),
});

const unsubscribePushSchema = z.object({
  endpoint: z.string().url(),
});

const createTemplateSchema = z.object({
  templateName: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  htmlContent: z.string().min(1),
  textContent: z.string().optional(),
  variables: z.array(z.string()).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const markAllReadSchema = z.object({
  category: notificationCategorySchema.optional(),
});

// ============================================================================
// USER NOTIFICATION ROUTES
// ============================================================================

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
notificationsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = getNotificationsSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const filters = {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    };

    const result = await notificationService.getNotifications(tenantId, userId, filters);

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread notification count for the authenticated user
 */
notificationsRouter.get('/unread-count', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const category = req.query.category as NotificationCategory | undefined;

    const counts = await notificationService.getUnreadCount(tenantId, userId, category);

    res.json(counts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
notificationsRouter.patch('/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const notificationId = req.params.id;

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    const success = await notificationService.markAsRead(tenantId, notificationId, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found or already read' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
notificationsRouter.post('/read-all', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = markAllReadSchema.safeParse(req.body);
    const category = parsed.success ? parsed.data.category : undefined;

    const count = await notificationService.markAllAsRead(tenantId, userId, category);

    res.json({ success: true, count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/:id
 * Dismiss a notification
 */
notificationsRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const notificationId = req.params.id;

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    const success = await notificationService.dismissNotification(tenantId, notificationId, userId);

    if (!success) {
      return res.status(404).json({ error: 'Notification not found or already dismissed' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PREFERENCES ROUTES
// ============================================================================

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the authenticated user
 */
notificationsRouter.get('/preferences', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const preferences = await notificationService.getPreferences(tenantId, userId);

    // Include default preferences for categories not yet configured
    const allCategories: NotificationCategory[] = [
      'clinical',
      'administrative',
      'billing',
      'scheduling',
      'compliance',
      'inventory',
      'patient',
      'system',
    ];

    const configuredCategories = new Set(preferences.map((p) => p.category));
    const defaultPreferences = allCategories
      .filter((cat) => !configuredCategories.has(cat))
      .map((category) => ({
        category,
        inAppEnabled: true,
        emailEnabled: true,
        pushEnabled: false,
        soundEnabled: true,
        minPriority: 'low' as NotificationPriority,
        quietHoursStart: null,
        quietHoursEnd: null,
      }));

    res.json({
      preferences: [...preferences, ...defaultPreferences],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/notifications/preferences
 * Update notification preferences
 */
notificationsRouter.patch('/preferences', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updated = await notificationService.updatePreferences(
      tenantId,
      userId,
      parsed.data.preferences
    );

    await auditLog(tenantId, userId, 'notification_preferences_update', 'notification_preferences', userId);

    res.json({ preferences: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PUSH SUBSCRIPTION ROUTES
// ============================================================================

/**
 * POST /api/notifications/push/subscribe
 * Register a push subscription
 */
notificationsRouter.post('/push/subscribe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const subscription = await notificationService.subscribePush(tenantId, userId, {
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      userAgent: parsed.data.userAgent,
      deviceName: parsed.data.deviceName,
    });

    await auditLog(tenantId, userId, 'push_subscription_create', 'push_subscription', subscription.id);

    res.status(201).json({ subscription });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/push/unsubscribe
 * Remove a push subscription
 */
notificationsRouter.delete('/push/unsubscribe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = unsubscribePushSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const success = await notificationService.unsubscribePush(
      tenantId,
      userId,
      parsed.data.endpoint
    );

    if (!success) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await auditLog(tenantId, userId, 'push_subscription_delete', 'push_subscription', userId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/push/subscriptions
 * Get push subscriptions for the authenticated user
 */
notificationsRouter.get('/push/subscriptions', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const subscriptions = await notificationService.getPushSubscriptions(tenantId, userId);

    res.json({ subscriptions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * POST /api/notifications/send
 * Send a notification to a specific user (admin only)
 */
notificationsRouter.post('/send', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const senderId = req.user!.id;

    // Only admins can send arbitrary notifications
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const parsed = createNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const notification = await notificationService.createNotification(tenantId, {
      userId: parsed.data.userId,
      type: parsed.data.type,
      category: parsed.data.category,
      title: parsed.data.title,
      message: parsed.data.message,
      data: { ...parsed.data.data, sentBy: senderId },
      priority: parsed.data.priority,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId,
      actionUrl: parsed.data.actionUrl,
      actionLabel: parsed.data.actionLabel,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
    });

    await auditLog(tenantId, senderId, 'notification_send', 'notification', notification.id);

    res.status(201).json({ notification });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/broadcast
 * Broadcast a notification to multiple users (admin only)
 */
notificationsRouter.post('/broadcast', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const senderId = req.user!.id;

    // Only admins can broadcast notifications
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const parsed = broadcastSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const result = await notificationService.sendBatch(
      tenantId,
      parsed.data.userIds,
      {
        type: parsed.data.type,
        category: parsed.data.category,
        title: parsed.data.title,
        message: parsed.data.message,
        data: { ...parsed.data.data, sentBy: senderId },
        priority: parsed.data.priority,
      },
      parsed.data.channels as NotificationChannel[]
    );

    await auditLog(tenantId, senderId, 'notification_broadcast', 'notification_batch', result.batchId);

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EMAIL TEMPLATE ROUTES
// ============================================================================

/**
 * GET /api/notifications/templates
 * List email templates
 */
notificationsRouter.get('/templates', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    // Only admins can view templates
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const activeOnly = req.query.activeOnly !== 'false';
    const templates = await notificationService.getEmailTemplates(tenantId, activeOnly);

    res.json({ templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/templates/:name
 * Get a specific email template
 */
notificationsRouter.get('/templates/:name', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const templateName = req.params.name;

    // Only admins can view templates
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const template = await notificationService.getEmailTemplate(tenantId, templateName);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/templates
 * Create a new email template
 */
notificationsRouter.post('/templates', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Only admins can create templates
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const template = await notificationService.saveEmailTemplate(tenantId, parsed.data, userId);

    await auditLog(tenantId, userId, 'email_template_create', 'email_template', template.id);

    res.status(201).json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/notifications/templates/:id
 * Update an email template
 */
notificationsRouter.patch('/templates/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const templateId = req.params.id;

    // Only admins can update templates
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!templateId) {
      return res.status(400).json({ error: 'Template ID is required' });
    }

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    // Get existing template to get the name
    const existing = await notificationService.getEmailTemplate(tenantId, templateId);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = await notificationService.saveEmailTemplate(
      tenantId,
      {
        templateName: existing.templateName,
        subject: parsed.data.subject || existing.subject,
        htmlContent: parsed.data.htmlContent || existing.htmlContent,
        textContent: parsed.data.textContent,
        variables: parsed.data.variables,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
      },
      userId
    );

    await auditLog(tenantId, userId, 'email_template_update', 'email_template', template.id);

    res.json({ template });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// QUEUE MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/notifications/queue
 * View notification queue (admin only)
 */
notificationsRouter.get('/queue', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    // Only admins can view queue
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const status = req.query.status as any;
    const channel = req.query.channel as NotificationChannel | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const [stats, items] = await Promise.all([
      notificationService.getQueueStats(tenantId),
      notificationService.getQueueItems(tenantId, { status, channel, limit, offset }),
    ]);

    res.json({ stats, ...items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/queue/process
 * Manually trigger queue processing (admin only)
 */
notificationsRouter.post('/queue/process', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Only admins can trigger queue processing
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const batchSize = req.body.batchSize ? parseInt(req.body.batchSize, 10) : 100;

    const result = await notificationService.processNotificationQueue(batchSize);

    await auditLog(tenantId, userId, 'notification_queue_process', 'notification_queue', 'batch');

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/queue/:id
 * Cancel a queued notification (admin only)
 */
notificationsRouter.delete('/queue/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const queueId = req.params.id;

    // Only admins can cancel queue items
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!queueId) {
      return res.status(400).json({ error: 'Queue item ID is required' });
    }

    const success = await notificationService.cancelQueueItem(tenantId, queueId);

    if (!success) {
      return res.status(404).json({ error: 'Queue item not found or not cancellable' });
    }

    await auditLog(tenantId, userId, 'notification_queue_cancel', 'notification_queue', queueId);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MAINTENANCE ROUTES
// ============================================================================

/**
 * POST /api/notifications/cleanup
 * Clean up expired notifications (admin only)
 */
notificationsRouter.post('/cleanup', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Only admins can run cleanup
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const count = await notificationService.clearExpired(tenantId);

    await auditLog(tenantId, userId, 'notification_cleanup', 'notifications', 'cleanup');

    res.json({ success: true, clearedCount: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default notificationsRouter;
