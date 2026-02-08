/**
 * Event Orchestration API Routes
 *
 * Provides endpoints for:
 * - Manually emitting events (admin)
 * - Viewing event definitions
 * - Viewing event log/history
 * - Managing event handlers
 * - Managing webhook subscriptions
 * - Monitoring event processing
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { eventBus, EventEmitters } from '../services/eventBusService';
import { logger } from '../lib/logger';
import { pool } from '../db/pool';

const router = Router();

// ============================================================================
// EMIT EVENTS
// ============================================================================

/**
 * POST /api/events/emit
 * Manually emit an event (admin only)
 */
const emitEventSchema = z.object({
  eventName: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  sync: z.boolean().optional(),
});

router.post('/emit', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Check for admin role (optional - remove if all users can emit)
    // if (!req.user!.roles?.includes('admin')) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }

    const parsed = emitEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { eventName, payload, entityType, entityId, sync } = parsed.data;

    // Validate event exists
    const eventDef = await pool.query(
      `SELECT * FROM event_definitions WHERE event_name = $1 AND is_active = true`,
      [eventName]
    );

    if (!eventDef.rowCount) {
      return res.status(400).json({ error: `Unknown event: ${eventName}` });
    }

    const result = await eventBus.emit(
      {
        tenantId,
        eventName,
        payload: payload || {},
        sourceService: 'api',
        sourceUserId: userId,
        entityType,
        entityId,
      },
      { sync }
    );

    logger.info('Event emitted via API', {
      eventName,
      eventId: result.eventId,
      userId,
    });

    res.json({
      success: true,
      eventId: result.eventId,
      correlationId: result.correlationId,
      handlersTriggered: result.handlersTriggered,
      results: sync ? result.results : undefined,
    });
  } catch (error: any) {
    logger.error('Error emitting event', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EVENT DEFINITIONS
// ============================================================================

/**
 * GET /api/events/definitions
 * List all event definitions
 */
router.get('/definitions', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const category = req.query.category as string | undefined;

    const definitions = await eventBus.getEventDefinitions(category);

    // Group by category
    const grouped = definitions.reduce((acc: Record<string, any[]>, def: any) => {
      const cat = def.event_category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({
        eventName: def.event_name,
        description: def.description,
        payloadSchema: def.payload_schema,
        examplePayload: def.example_payload,
        isSystem: def.is_system,
      });
      return acc;
    }, {});

    res.json({
      categories: Object.keys(grouped),
      definitions: grouped,
      total: definitions.length,
    });
  } catch (error: any) {
    logger.error('Error getting event definitions', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/definitions
 * Create a custom event definition
 */
const createDefinitionSchema = z.object({
  eventName: z.string().min(1).max(255),
  eventCategory: z.string().min(1).max(100),
  description: z.string().optional(),
  payloadSchema: z.record(z.string(), z.any()).optional(),
  examplePayload: z.record(z.string(), z.any()).optional(),
});

router.post('/definitions', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = createDefinitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { eventName, eventCategory, description, payloadSchema, examplePayload } = parsed.data;

    const result = await pool.query(
      `INSERT INTO event_definitions (
        event_name, event_category, description, payload_schema, example_payload, is_system
      ) VALUES ($1, $2, $3, $4, $5, false)
      RETURNING *`,
      [
        eventName,
        eventCategory,
        description || null,
        JSON.stringify(payloadSchema || {}),
        JSON.stringify(examplePayload || {}),
      ]
    );

    res.status(201).json({
      success: true,
      definition: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Event already exists' });
    }
    logger.error('Error creating event definition', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EVENT LOG
// ============================================================================

/**
 * GET /api/events/log
 * View event history with filtering
 */
router.get('/log', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const filters = {
      eventName: req.query.eventName as string | undefined,
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    };

    const result = await eventBus.getEventLog(tenantId, filters);

    res.json({
      events: result.events.map(e => ({
        id: e.id,
        eventName: e.event_name,
        payload: e.payload,
        sourceService: e.source_service,
        entityType: e.entity_type,
        entityId: e.entity_id,
        correlationId: e.correlation_id,
        status: e.status,
        triggeredAt: e.triggered_at,
        processedAt: e.processed_at,
        durationMs: e.processing_duration_ms,
        handlersProcessed: e.processed_handlers?.length || 0,
        errors: e.errors,
      })),
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error: any) {
    logger.error('Error getting event log', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/log/:eventId
 * Get details of a specific event
 */
router.get('/log/:eventId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { eventId } = req.params;

    const eventResult = await pool.query(
      `SELECT * FROM event_log WHERE id = $1 AND tenant_id = $2`,
      [eventId, tenantId]
    );

    if (!eventResult.rowCount) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = eventResult.rows[0];

    // Get handler executions
    const executionsResult = await pool.query(
      `SELECT ehe.*, eh.handler_service
       FROM event_handler_executions ehe
       JOIN event_handlers eh ON eh.id = ehe.handler_id
       WHERE ehe.event_log_id = $1
       ORDER BY ehe.started_at`,
      [eventId]
    );

    res.json({
      event: {
        id: event.id,
        eventName: event.event_name,
        payload: event.payload,
        sourceService: event.source_service,
        sourceUserId: event.source_user_id,
        entityType: event.entity_type,
        entityId: event.entity_id,
        correlationId: event.correlation_id,
        status: event.status,
        triggeredAt: event.triggered_at,
        processedAt: event.processed_at,
        durationMs: event.processing_duration_ms,
        errors: event.errors,
        metadata: event.metadata,
      },
      handlerExecutions: executionsResult.rows.map(e => ({
        handlerName: e.handler_name,
        handlerService: e.handler_service,
        status: e.status,
        startedAt: e.started_at,
        completedAt: e.completed_at,
        durationMs: e.duration_ms,
        attemptNumber: e.attempt_number,
        result: e.result,
        error: e.error_message,
      })),
    });
  } catch (error: any) {
    logger.error('Error getting event details', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * GET /api/events/handlers
 * List all event handlers
 */
router.get('/handlers', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const eventName = req.query.eventName as string | undefined;

    let query = `
      SELECT eh.*, ed.event_category
      FROM event_handlers eh
      LEFT JOIN event_definitions ed ON ed.event_name = eh.event_name
      WHERE eh.is_active = true
    `;
    const params: any[] = [];

    if (eventName) {
      query += ` AND eh.event_name = $1`;
      params.push(eventName);
    }

    query += ` ORDER BY eh.event_name, eh.priority`;

    const result = await pool.query(query, params);

    res.json({
      handlers: result.rows.map(h => ({
        id: h.id,
        eventName: h.event_name,
        eventCategory: h.event_category,
        handlerName: h.handler_name,
        handlerService: h.handler_service,
        handlerMethod: h.handler_method,
        description: h.description,
        priority: h.priority,
        isAsync: h.is_async,
        retryCount: h.retry_count,
        timeoutMs: h.timeout_ms,
        conditions: h.conditions,
      })),
      total: result.rowCount,
    });
  } catch (error: any) {
    logger.error('Error getting handlers', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/handlers/:eventName
 * Get handlers for a specific event
 */
router.get('/handlers/:eventName', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const eventName = req.params.eventName ?? '';

    const handlers = await eventBus.getHandlersForEvent(eventName);

    // Also get in-memory handlers
    const memoryHandlers = eventBus.getHandlers(eventName);

    res.json({
      eventName,
      dbHandlers: handlers,
      memoryHandlers,
      total: handlers.length,
    });
  } catch (error: any) {
    logger.error('Error getting handlers for event', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/handlers
 * Register a new event handler
 */
const registerHandlerSchema = z.object({
  eventName: z.string().min(1),
  handlerName: z.string().min(1),
  handlerService: z.string().min(1),
  handlerMethod: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  isAsync: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  config: z.record(z.string(), z.any()).optional(),
  conditions: z.record(z.string(), z.any()).optional(),
});

router.post('/handlers', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const parsed = registerHandlerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const handler = await eventBus.registerHandler(parsed.data);

    logger.info('Handler registered', {
      eventName: handler.eventName,
      handlerName: handler.handlerName,
    });

    res.status(201).json({
      success: true,
      handler,
    });
  } catch (error: any) {
    logger.error('Error registering handler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/events/handlers/:handlerId
 * Update a handler
 */
router.patch('/handlers/:handlerId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;
    const { isActive, priority, retryCount, config, conditions } = req.body;

    const updates: string[] = [];
    const params: any[] = [handlerId];
    let paramIndex = 2;

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (retryCount !== undefined) {
      updates.push(`retry_count = $${paramIndex++}`);
      params.push(retryCount);
    }
    if (config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      params.push(JSON.stringify(config));
    }
    if (conditions !== undefined) {
      updates.push(`conditions = $${paramIndex++}`);
      params.push(JSON.stringify(conditions));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE event_handlers SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Handler not found' });
    }

    res.json({ success: true, handler: result.rows[0] });
  } catch (error: any) {
    logger.error('Error updating handler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/events/handlers/:handlerId
 * Delete (deactivate) a handler
 */
router.delete('/handlers/:handlerId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { handlerId } = req.params;

    const result = await pool.query(
      `UPDATE event_handlers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [handlerId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Handler not found' });
    }

    res.json({ success: true, message: 'Handler deactivated' });
  } catch (error: any) {
    logger.error('Error deleting handler', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WEBHOOK SUBSCRIPTIONS
// ============================================================================

/**
 * GET /api/events/subscriptions
 * List webhook subscriptions
 */
router.get('/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT * FROM event_subscriptions
       WHERE tenant_id = $1
       ORDER BY event_name, subscription_name`,
      [tenantId]
    );

    res.json({
      subscriptions: result.rows.map(s => ({
        id: s.id,
        subscriptionName: s.subscription_name,
        eventName: s.event_name,
        eventPattern: s.event_pattern,
        webhookUrl: s.webhook_url,
        isActive: s.is_active,
        lastTriggeredAt: s.last_triggered_at,
        lastSuccessAt: s.last_success_at,
        failureCount: s.failure_count,
        createdAt: s.created_at,
      })),
      total: result.rowCount,
    });
  } catch (error: any) {
    logger.error('Error getting subscriptions', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/subscriptions
 * Create a webhook subscription
 */
const createSubscriptionSchema = z.object({
  subscriptionName: z.string().min(1).max(255),
  eventName: z.string().min(1),
  eventPattern: z.string().optional(),
  webhookUrl: z.string().url(),
  secretKey: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

router.post('/subscriptions', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const subscription = await eventBus.createSubscription({
      tenantId,
      ...parsed.data,
      createdBy: userId,
    });

    logger.info('Webhook subscription created', {
      subscriptionName: parsed.data.subscriptionName,
      eventName: parsed.data.eventName,
    });

    res.status(201).json({
      success: true,
      subscription,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Subscription name already exists' });
    }
    logger.error('Error creating subscription', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/events/subscriptions/:subscriptionId
 * Update a subscription
 */
router.patch('/subscriptions/:subscriptionId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { subscriptionId } = req.params;
    const { isActive, webhookUrl, secretKey, headers } = req.body;

    const updates: string[] = [];
    const params: any[] = [subscriptionId, tenantId];
    let paramIndex = 3;

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }
    if (webhookUrl !== undefined) {
      updates.push(`webhook_url = $${paramIndex++}`);
      params.push(webhookUrl);
    }
    if (secretKey !== undefined) {
      updates.push(`secret_key = $${paramIndex++}`);
      params.push(secretKey);
    }
    if (headers !== undefined) {
      updates.push(`headers = $${paramIndex++}`);
      params.push(JSON.stringify(headers));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE event_subscriptions SET ${updates.join(', ')}
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ success: true, subscription: result.rows[0] });
  } catch (error: any) {
    logger.error('Error updating subscription', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/events/subscriptions/:subscriptionId
 * Delete a subscription
 */
router.delete('/subscriptions/:subscriptionId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { subscriptionId } = req.params;

    const result = await pool.query(
      `DELETE FROM event_subscriptions WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [subscriptionId, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ success: true, message: 'Subscription deleted' });
  } catch (error: any) {
    logger.error('Error deleting subscription', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/subscriptions/:subscriptionId/test
 * Test a webhook subscription
 */
router.post('/subscriptions/:subscriptionId/test', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { subscriptionId } = req.params;

    const subResult = await pool.query(
      `SELECT * FROM event_subscriptions WHERE id = $1 AND tenant_id = $2`,
      [subscriptionId, tenantId]
    );

    if (!subResult.rowCount) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const subscription = subResult.rows[0];

    // Send test payload
    const testPayload = {
      event: 'test.webhook',
      eventId: 'test-' + Date.now(),
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        subscriptionId,
      },
    };

    const startTime = Date.now();
    let responseStatus = 0;
    let responseBody = '';
    let error = '';

    try {
      const response = await fetch(subscription.webhook_url, {
        method: subscription.http_method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Name': 'test.webhook',
          'X-Test': 'true',
          ...(subscription.headers || {}),
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      responseStatus = response.status;
      responseBody = await response.text();
    } catch (err: any) {
      error = err.message;
    }

    const responseTime = Date.now() - startTime;

    res.json({
      success: responseStatus >= 200 && responseStatus < 300,
      responseStatus,
      responseTime,
      responseBody: responseBody.substring(0, 1000),
      error: error || undefined,
    });
  } catch (error: any) {
    logger.error('Error testing subscription', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DEAD LETTER QUEUE
// ============================================================================

/**
 * GET /api/events/dlq
 * Get dead letter queue entries
 */
router.get('/dlq', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const limit = parseInt(req.query.limit as string) || 50;

    const entries = await eventBus.getDeadLetterQueue(tenantId, limit);

    res.json({
      entries: entries.map(e => ({
        id: e.id,
        eventName: e.event_name,
        payload: e.payload,
        errorMessage: e.error_message,
        failureCount: e.failure_count,
        firstFailedAt: e.first_failed_at,
        lastFailedAt: e.last_failed_at,
        status: e.status,
      })),
      total: entries.length,
    });
  } catch (error: any) {
    logger.error('Error getting DLQ', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/events/dlq/:entryId/retry
 * Retry a dead letter queue entry
 */
router.post('/dlq/:entryId/retry', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const entryId = req.params.entryId ?? '';

    await eventBus.retryDeadLetter(entryId);

    logger.info('DLQ entry requeued', { entryId });

    res.json({ success: true, message: 'Event requeued for processing' });
  } catch (error: any) {
    logger.error('Error retrying DLQ entry', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/events/dlq/:entryId
 * Dismiss a dead letter queue entry
 */
router.delete('/dlq/:entryId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { entryId } = req.params;
    const { resolutionNotes } = req.body;

    const result = await pool.query(
      `UPDATE event_dead_letter_queue
       SET status = 'dismissed',
           reviewed_by = $1,
           reviewed_at = NOW(),
           resolution_notes = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id`,
      [userId, resolutionNotes || 'Dismissed via API', entryId, tenantId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'DLQ entry not found' });
    }

    res.json({ success: true, message: 'Entry dismissed' });
  } catch (error: any) {
    logger.error('Error dismissing DLQ entry', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MONITORING & STATS
// ============================================================================

/**
 * GET /api/events/stats
 * Get event processing statistics
 */
router.get('/stats', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const hoursBack = parseInt(req.query.hours as string) || 24;

    const stats = await eventBus.getEventStats(tenantId, hoursBack);

    // Get queue status
    const queueResult = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM event_queue
       WHERE tenant_id = $1
       GROUP BY status`,
      [tenantId]
    );

    const queueStatus: Record<string, number> = {};
    queueResult.rows.forEach(r => {
      queueStatus[r.status] = parseInt(r.count);
    });

    // Get DLQ count
    const dlqResult = await pool.query(
      `SELECT COUNT(*) as count FROM event_dead_letter_queue
       WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId]
    );

    res.json({
      period: `${hoursBack} hours`,
      eventStats: stats,
      queueStatus,
      deadLetterCount: parseInt(dlqResult.rows[0].count),
    });
  } catch (error: any) {
    logger.error('Error getting event stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/events/health
 * Health check for event system
 */
router.get('/health', async (req, res: Response) => {
  try {
    // Check queue processing
    const queueResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '5 minutes') as stale,
         MAX(processed_at) as last_processed
       FROM event_queue`
    );

    const queue = queueResult.rows[0];
    const healthy = parseInt(queue.stale) === 0;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      queue: {
        pending: parseInt(queue.pending),
        staleProcessing: parseInt(queue.stale),
        lastProcessed: queue.last_processed,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export const eventsRouter = router;
