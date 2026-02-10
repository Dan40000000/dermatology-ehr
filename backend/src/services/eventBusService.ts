/**
 * Event Bus Service - Master Event Orchestrator
 *
 * Central pub/sub event system that connects ALL services in the dermatology CRM:
 * - Patient Engagement
 * - Referral Management
 * - Patient Intake
 * - Revenue Cycle
 * - Inventory
 * - Quality Measures
 * - Staff Scheduling
 * - SMS Workflow
 *
 * Features:
 * - Pub/sub event pattern
 * - Priority-based handler execution
 * - Retry logic with exponential backoff
 * - Dead letter queue for failed events
 * - Event logging for audit trail
 * - Webhook subscriptions for external integrations
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface EventPayload {
  [key: string]: any;
}

export interface Event {
  id?: string;
  tenantId: string;
  eventName: string;
  payload: EventPayload;
  sourceService?: string;
  sourceUserId?: string;
  entityType?: string;
  entityId?: string;
  correlationId?: string;
  parentEventId?: string;
  metadata?: Record<string, any>;
}

export interface EventHandler {
  id: string;
  eventName: string;
  handlerName: string;
  handlerService: string;
  handlerMethod: string;
  priority: number;
  isAsync: boolean;
  retryCount: number;
  retryDelayMs: number;
  timeoutMs: number;
  config: Record<string, any>;
  conditions: Record<string, any>;
}

export interface HandlerResult {
  handlerName: string;
  success: boolean;
  result?: any;
  error?: string;
  durationMs: number;
}

export interface EventEmitResult {
  eventId: string;
  correlationId: string;
  handlersTriggered: number;
  results: HandlerResult[];
}

export interface EventSubscription {
  id: string;
  tenantId: string;
  eventName: string;
  webhookUrl: string;
  secretKey?: string;
  isActive: boolean;
}

type HandlerFunction = (tenantId: string, payload: EventPayload, event: Event) => Promise<any>;

// ============================================================================
// IN-MEMORY HANDLER REGISTRY
// ============================================================================

const handlerRegistry: Map<string, Map<string, HandlerFunction>> = new Map();

// ============================================================================
// EVENT BUS SERVICE CLASS
// ============================================================================

export class EventBusService {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  /**
   * Subscribe a handler function to an event
   * Handlers are stored in memory for fast execution
   */
  subscribe(eventName: string, handlerName: string, handler: HandlerFunction): void {
    if (!handlerRegistry.has(eventName)) {
      handlerRegistry.set(eventName, new Map());
    }
    handlerRegistry.get(eventName)!.set(handlerName, handler);
    logger.debug('Handler subscribed', { eventName, handlerName });
  }

  /**
   * Unsubscribe a handler from an event
   */
  unsubscribe(eventName: string, handlerName: string): boolean {
    const eventHandlers = handlerRegistry.get(eventName);
    if (eventHandlers) {
      const result = eventHandlers.delete(handlerName);
      if (eventHandlers.size === 0) {
        handlerRegistry.delete(eventName);
      }
      return result;
    }
    return false;
  }

  /**
   * Get all registered handlers for an event
   */
  getHandlers(eventName: string): string[] {
    const eventHandlers = handlerRegistry.get(eventName);
    return eventHandlers ? Array.from(eventHandlers.keys()) : [];
  }

  // ============================================
  // EVENT EMISSION
  // ============================================

  /**
   * Emit an event - main entry point
   *
   * @param event - The event to emit
   * @param options - Emission options
   * @returns Promise<EventEmitResult>
   */
  async emit(event: Event, options?: { sync?: boolean }): Promise<EventEmitResult> {
    const correlationId = event.correlationId || crypto.randomUUID();
    const eventId = crypto.randomUUID();

    logger.info('Emitting event', {
      eventName: event.eventName,
      tenantId: event.tenantId,
      correlationId,
      entityType: event.entityType,
      entityId: event.entityId,
    });

    try {
      // 1. Log the event
      await this.logEvent(eventId, event, correlationId);

      // 2. Get handlers from database
      const dbHandlers = await this.getEventHandlers(event.eventName);

      // 3. Get handlers from in-memory registry
      const memoryHandlers = handlerRegistry.get(event.eventName);

      const results: HandlerResult[] = [];
      let handlersTriggered = 0;

      // 4. Execute handlers
      if (options?.sync) {
        // Synchronous execution - wait for all handlers
        for (const handler of dbHandlers) {
          handlersTriggered++;
          const result = await this.executeHandler(event, handler, memoryHandlers);
          results.push(result);
          await this.logHandlerExecution(eventId, handler.id, result);
        }
      } else {
        // Async execution - queue for processing
        await this.queueEvent(event, eventId, correlationId);
        handlersTriggered = dbHandlers.length;
      }

      // 5. Trigger webhook subscriptions (always async)
      this.triggerWebhooks(event, eventId).catch(err => {
        logger.error('Error triggering webhooks', { error: err.message, eventId });
      });

      // 6. Update event log
      await this.updateEventLog(eventId, 'completed', results);

      return {
        eventId,
        correlationId,
        handlersTriggered,
        results,
      };
    } catch (error: any) {
      logger.error('Error emitting event', {
        eventName: event.eventName,
        error: error.message,
      });

      await this.updateEventLog(eventId, 'failed', [], [{ error: error.message, at: new Date() }]);

      throw error;
    }
  }

  /**
   * Emit an event synchronously - waits for all handlers to complete
   */
  async emitSync(event: Event): Promise<EventEmitResult> {
    return this.emit(event, { sync: true });
  }

  /**
   * Emit an event asynchronously - queues for background processing
   */
  async emitAsync(event: Event): Promise<EventEmitResult> {
    return this.emit(event, { sync: false });
  }

  // ============================================
  // EVENT PROCESSING
  // ============================================

  /**
   * Process a single event - executes all handlers
   */
  async processEvent(eventId: string): Promise<HandlerResult[]> {
    const client = await pool.connect();

    try {
      // Get event from log
      const eventResult = await client.query(
        `SELECT * FROM event_log WHERE id = $1`,
        [eventId]
      );

      if (!eventResult.rowCount) {
        throw new Error(`Event ${eventId} not found`);
      }

      const eventRow = eventResult.rows[0];
      const event: Event = {
        id: eventRow.id,
        tenantId: eventRow.tenant_id,
        eventName: eventRow.event_name,
        payload: eventRow.payload,
        sourceService: eventRow.source_service,
        sourceUserId: eventRow.source_user_id,
        entityType: eventRow.entity_type,
        entityId: eventRow.entity_id,
        correlationId: eventRow.correlation_id,
      };

      // Get handlers
      const handlers = await this.getEventHandlers(event.eventName);
      const memoryHandlers = handlerRegistry.get(event.eventName);

      const results: HandlerResult[] = [];

      // Execute each handler
      for (const handler of handlers) {
        const result = await this.executeHandler(event, handler, memoryHandlers);
        results.push(result);
        await this.logHandlerExecution(eventId, handler.id, result);
      }

      // Update event log
      await this.updateEventLog(eventId, 'completed', results);

      return results;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a single handler for an event
   */
  private async executeHandler(
    event: Event,
    handler: EventHandler,
    memoryHandlers?: Map<string, HandlerFunction>
  ): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      // Check conditions
      if (handler.conditions && Object.keys(handler.conditions).length > 0) {
        const conditionsMet = this.evaluateConditions(handler.conditions, event.payload);
        if (!conditionsMet) {
          return {
            handlerName: handler.handlerName,
            success: true,
            result: { skipped: true, reason: 'Conditions not met' },
            durationMs: Date.now() - startTime,
          };
        }
      }

      // Try in-memory handler first
      const memoryHandler = memoryHandlers?.get(handler.handlerName);
      if (memoryHandler) {
        const result = await this.executeWithRetry(
          () => memoryHandler(event.tenantId, event.payload, event),
          handler.retryCount,
          handler.retryDelayMs,
          handler.timeoutMs
        );

        return {
          handlerName: handler.handlerName,
          success: true,
          result,
          durationMs: Date.now() - startTime,
        };
      }

      // Fall back to dynamic service/method lookup
      const service = await this.getService(handler.handlerService);
      if (!service) {
        throw new Error(`Service ${handler.handlerService} not found`);
      }

      const method = (service as any)[handler.handlerMethod];
      if (typeof method !== 'function') {
        throw new Error(`Method ${handler.handlerMethod} not found on ${handler.handlerService}`);
      }

      const result = await this.executeWithRetry(
        () => method.call(service, event.tenantId, event.payload, event),
        handler.retryCount,
        handler.retryDelayMs,
        handler.timeoutMs
      );

      return {
        handlerName: handler.handlerName,
        success: true,
        result,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      logger.error('Handler execution failed', {
        handlerName: handler.handlerName,
        eventName: event.eventName,
        error: error.message,
      });

      return {
        handlerName: handler.handlerName,
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute with retry logic and timeout
   */
  private async executeWithRetry(
    fn: () => Promise<any>,
    maxRetries: number,
    retryDelayMs: number,
    timeoutMs: number
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Wrap in timeout
        const result = await Promise.race([
          fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Handler timeout')), timeoutMs)
          ),
        ]);
        return result;
      } catch (error: any) {
        lastError = error;

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = retryDelayMs * Math.pow(2, attempt);
          logger.debug('Retrying handler', { attempt: attempt + 1, delay });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Evaluate handler conditions against event payload
   */
  private evaluateConditions(conditions: Record<string, any>, payload: EventPayload): boolean {
    for (const [key, expected] of Object.entries(conditions)) {
      const actual = this.getNestedValue(payload, key);

      if (typeof expected === 'object' && expected !== null) {
        // Complex conditions
        if (expected.$eq !== undefined && actual !== expected.$eq) return false;
        if (expected.$ne !== undefined && actual === expected.$ne) return false;
        if (expected.$gt !== undefined && !(actual > expected.$gt)) return false;
        if (expected.$gte !== undefined && !(actual >= expected.$gte)) return false;
        if (expected.$lt !== undefined && !(actual < expected.$lt)) return false;
        if (expected.$lte !== undefined && !(actual <= expected.$lte)) return false;
        if (expected.$in !== undefined && !expected.$in.includes(actual)) return false;
        if (expected.$nin !== undefined && expected.$nin.includes(actual)) return false;
        if (expected.$exists !== undefined && (actual !== undefined) !== expected.$exists) return false;
      } else {
        // Simple equality
        if (actual !== expected) return false;
      }
    }

    return true;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ============================================
  // DATABASE OPERATIONS
  // ============================================

  /**
   * Get event handlers from database
   */
  private async getEventHandlers(eventName: string): Promise<EventHandler[]> {
    const result = await pool.query(
      `SELECT id, event_name, handler_name, handler_service, handler_method,
              priority, is_async, retry_count, retry_delay_ms, timeout_ms,
              config, conditions
       FROM event_handlers
       WHERE event_name = $1 AND is_active = true
       ORDER BY priority ASC`,
      [eventName]
    );

    return result.rows.map(row => ({
      id: row.id,
      eventName: row.event_name,
      handlerName: row.handler_name,
      handlerService: row.handler_service,
      handlerMethod: row.handler_method,
      priority: row.priority,
      isAsync: row.is_async,
      retryCount: row.retry_count,
      retryDelayMs: row.retry_delay_ms,
      timeoutMs: row.timeout_ms,
      config: row.config || {},
      conditions: row.conditions || {},
    }));
  }

  /**
   * Log event to database
   */
  private async logEvent(eventId: string, event: Event, correlationId: string): Promise<void> {
    await pool.query(
      `INSERT INTO event_log (
        id, tenant_id, event_name, event_id, payload, source_service, source_user_id,
        entity_type, entity_id, correlation_id, parent_event_id, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)`,
      [
        eventId,
        event.tenantId,
        event.eventName,
        eventId,
        JSON.stringify(event.payload),
        event.sourceService || null,
        event.sourceUserId || null,
        event.entityType || null,
        event.entityId || null,
        correlationId,
        event.parentEventId || null,
        JSON.stringify(event.metadata || {}),
      ]
    );
  }

  /**
   * Update event log status
   */
  private async updateEventLog(
    eventId: string,
    status: string,
    results: HandlerResult[],
    errors: any[] = []
  ): Promise<void> {
    await pool.query(
      `UPDATE event_log
       SET status = $1,
           processed_at = NOW(),
           processing_duration_ms = EXTRACT(EPOCH FROM (NOW() - triggered_at)) * 1000,
           processed_handlers = $2,
           errors = $3
       WHERE id = $4`,
      [status, JSON.stringify(results), JSON.stringify(errors), eventId]
    );
  }

  /**
   * Log handler execution
   */
  private async logHandlerExecution(
    eventLogId: string,
    handlerId: string,
    result: HandlerResult
  ): Promise<void> {
    await pool.query(
      `INSERT INTO event_handler_executions (
        event_log_id, handler_id, handler_name, started_at, completed_at,
        duration_ms, status, result, error_message
      ) VALUES ($1, $2, $3, NOW() - ($4 || ' milliseconds')::INTERVAL, NOW(), $4, $5, $6, $7)`,
      [
        eventLogId,
        handlerId,
        result.handlerName,
        result.durationMs,
        result.success ? 'completed' : 'failed',
        JSON.stringify(result.result || {}),
        result.error || null,
      ]
    );
  }

  /**
   * Queue event for async processing
   */
  private async queueEvent(event: Event, eventId: string, correlationId: string): Promise<void> {
    await pool.query(
      `INSERT INTO event_queue (
        tenant_id, event_name, payload, priority, scheduled_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [
        event.tenantId,
        event.eventName,
        JSON.stringify({
          eventLogId: eventId,
          correlationId,
          ...event.payload,
        }),
        100, // Default priority
      ]
    );
  }

  // ============================================
  // WEBHOOK HANDLING
  // ============================================

  /**
   * Trigger webhook subscriptions for an event
   */
  private async triggerWebhooks(event: Event, eventId: string): Promise<void> {
    const subscriptions = await pool.query(
      `SELECT * FROM event_subscriptions
       WHERE (event_name = $1 OR event_pattern IS NOT NULL AND $1 LIKE REPLACE(event_pattern, '*', '%'))
         AND tenant_id = $2
         AND is_active = true`,
      [event.eventName, event.tenantId]
    );

    for (const subscription of subscriptions.rows) {
      try {
        await this.deliverWebhook(subscription, event, eventId);
      } catch (error: any) {
        logger.error('Webhook delivery failed', {
          subscriptionId: subscription.id,
          eventId,
          error: error.message,
        });
      }
    }
  }

  /**
   * Deliver webhook to subscriber
   */
  private async deliverWebhook(
    subscription: any,
    event: Event,
    eventId: string
  ): Promise<void> {
    const payload = {
      event: event.eventName,
      eventId,
      timestamp: new Date().toISOString(),
      data: event.payload,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Event-Name': event.eventName,
      'X-Event-Id': eventId,
      ...(subscription.headers || {}),
    };

    // Sign payload if secret key is configured
    if (subscription.secret_key) {
      const signature = crypto
        .createHmac(subscription.signing_algorithm || 'sha256', subscription.secret_key)
        .update(JSON.stringify(payload))
        .digest('hex');
      headers['X-Signature'] = signature;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(subscription.webhook_url, {
        method: subscription.http_method || 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(subscription.timeout_ms || 10000),
      });

      await this.logWebhookDelivery(subscription.id, eventId, {
        status: response.status,
        responseTime: Date.now() - startTime,
        success: response.ok,
      });

      // Update subscription stats
      await pool.query(
        `UPDATE event_subscriptions
         SET last_triggered_at = NOW(),
             last_success_at = CASE WHEN $1 THEN NOW() ELSE last_success_at END,
             failure_count = CASE WHEN $1 THEN 0 ELSE failure_count + 1 END
         WHERE id = $2`,
        [response.ok, subscription.id]
      );
    } catch (error: any) {
      await this.logWebhookDelivery(subscription.id, eventId, {
        status: 0,
        responseTime: Date.now() - startTime,
        success: false,
        error: error.message,
      });

      await pool.query(
        `UPDATE event_subscriptions
         SET last_triggered_at = NOW(), failure_count = failure_count + 1
         WHERE id = $1`,
        [subscription.id]
      );
    }
  }

  /**
   * Log webhook delivery attempt
   */
  private async logWebhookDelivery(
    subscriptionId: string,
    eventLogId: string,
    result: { status: number; responseTime: number; success: boolean; error?: string }
  ): Promise<void> {
    await pool.query(
      `INSERT INTO event_subscription_deliveries (
        subscription_id, event_log_id, response_status, response_time_ms, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        subscriptionId,
        eventLogId,
        result.status,
        result.responseTime,
        result.success ? 'completed' : 'failed',
        result.error || null,
      ]
    );
  }

  // ============================================
  // SERVICE RESOLUTION
  // ============================================

  /**
   * Dynamically get service by name
   */
  private async getService(serviceName: string): Promise<any> {
    // Map service names to actual service modules
    const serviceMap: Record<string, () => Promise<any>> = {
      smsWorkflowService: async () => (await import('./smsWorkflowService')).smsWorkflowService,
      patientEngagementService: async () => (await import('./patientEngagementService')).patientEngagementService,
      referralService: async () => (await import('./referralService')).referralService,
      patientIntakeService: async () => (await import('./patientIntakeService')).patientIntakeService,
      revenueCycleService: async () => (await import('./revenueCycleService')).revenueCycleService,
      inventoryService: async () => (await import('./inventoryService')).inventoryService,
      qualityMeasuresService: async () => (await import('./qualityMeasuresService')).QualityMeasuresService,
      staffSchedulingService: async () => (await import('./staffSchedulingService')),
      notificationService: async () => (await import('./integrations/notificationService')).notificationService,
      workflowOrchestrator: async () => (await import('./workflowOrchestrator')).workflowOrchestrator,
    };

    const loader = serviceMap[serviceName];
    if (loader) {
      return await loader();
    }

    return null;
  }

  // ============================================
  // BACKGROUND PROCESSING
  // ============================================

  /**
   * Start the background event processor
   */
  startProcessor(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) return;

      this.isProcessing = true;
      try {
        await this.processPendingEvents();
      } catch (error: any) {
        logger.error('Error in event processor', { error: error.message });
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);

    logger.info('Event processor started', { intervalMs });
  }

  /**
   * Stop the background event processor
   */
  stopProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Event processor stopped');
    }
  }

  /**
   * Process pending events from the queue
   */
  private async processPendingEvents(batchSize: number = 10): Promise<number> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get pending events with locking
      const result = await client.query(
        `UPDATE event_queue
         SET status = 'processing',
             locked_at = NOW(),
             locked_by = 'event-processor',
             attempts = attempts + 1
         WHERE id IN (
           SELECT id FROM event_queue
           WHERE status = 'pending'
             AND scheduled_at <= NOW()
             AND attempts < max_attempts
           ORDER BY priority DESC, scheduled_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
        [batchSize]
      );

      await client.query('COMMIT');

      // Process each event
      for (const row of result.rows) {
        try {
          const eventLogId = row.payload.eventLogId;
          if (eventLogId) {
            await this.processEvent(eventLogId);
          }

          // Mark as completed
          await pool.query(
            `UPDATE event_queue
             SET status = 'completed', processed_at = NOW(), locked_at = NULL
             WHERE id = $1`,
            [row.id]
          );
        } catch (error: any) {
          // Handle failure
          const moveToDeadLetter = row.attempts >= row.max_attempts;

          if (moveToDeadLetter) {
            await pool.query(
              `INSERT INTO event_dead_letter_queue (
                original_event_id, tenant_id, event_name, payload,
                source_service, error_message
              ) VALUES ($1, $2, $3, $4, 'eventBusService', $5)`,
              [row.payload.eventLogId, row.tenant_id, row.event_name, row.payload, error.message]
            );

            await pool.query(
              `UPDATE event_queue SET status = 'dead_letter', locked_at = NULL WHERE id = $1`,
              [row.id]
            );
          } else {
            // Schedule retry with exponential backoff
            const delay = Math.pow(2, row.attempts) * 1000;
            await pool.query(
              `UPDATE event_queue
               SET status = 'pending',
                   locked_at = NULL,
                   scheduled_at = NOW() + ($1 || ' milliseconds')::INTERVAL,
                   error_message = $2
               WHERE id = $3`,
              [delay, error.message, row.id]
            );
          }
        }
      }

      return result.rowCount || 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get event definitions
   */
  async getEventDefinitions(category?: string): Promise<any[]> {
    let query = `SELECT * FROM event_definitions WHERE is_active = true`;
    const params: any[] = [];

    if (category) {
      query += ` AND event_category = $1`;
      params.push(category);
    }

    query += ` ORDER BY event_category, event_name`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get event log with filters
   */
  async getEventLog(
    tenantId: string,
    filters?: {
      eventName?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      entityType?: string;
      entityId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: any[]; total: number }> {
    let query = `SELECT * FROM event_log WHERE tenant_id = $1`;
    let countQuery = `SELECT COUNT(*) FROM event_log WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.eventName) {
      query += ` AND event_name = $${paramIndex}`;
      countQuery += ` AND event_name = $${paramIndex}`;
      params.push(filters.eventName);
      paramIndex++;
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex}`;
      countQuery += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.startDate) {
      query += ` AND triggered_at >= $${paramIndex}`;
      countQuery += ` AND triggered_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      query += ` AND triggered_at <= $${paramIndex}`;
      countQuery += ` AND triggered_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.entityType) {
      query += ` AND entity_type = $${paramIndex}`;
      countQuery += ` AND entity_type = $${paramIndex}`;
      params.push(filters.entityType);
      paramIndex++;
    }

    if (filters?.entityId) {
      query += ` AND entity_id = $${paramIndex}`;
      countQuery += ` AND entity_id = $${paramIndex}`;
      params.push(filters.entityId);
      paramIndex++;
    }

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY triggered_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(filters?.limit || 50, filters?.offset || 0);

    const result = await pool.query(query, params);

    return { events: result.rows, total };
  }

  /**
   * Get handlers for an event
   */
  async getHandlersForEvent(eventName: string): Promise<EventHandler[]> {
    return this.getEventHandlers(eventName);
  }

  /**
   * Register a new handler in the database
   */
  async registerHandler(handler: {
    eventName: string;
    handlerName: string;
    handlerService: string;
    handlerMethod: string;
    description?: string;
    priority?: number;
    isAsync?: boolean;
    retryCount?: number;
    config?: Record<string, any>;
    conditions?: Record<string, any>;
  }): Promise<EventHandler> {
    const result = await pool.query(
      `INSERT INTO event_handlers (
        event_name, handler_name, handler_service, handler_method,
        description, priority, is_async, retry_count, config, conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (event_name, handler_name)
      DO UPDATE SET
        handler_service = EXCLUDED.handler_service,
        handler_method = EXCLUDED.handler_method,
        description = EXCLUDED.description,
        priority = EXCLUDED.priority,
        is_async = EXCLUDED.is_async,
        retry_count = EXCLUDED.retry_count,
        config = EXCLUDED.config,
        conditions = EXCLUDED.conditions,
        updated_at = NOW()
      RETURNING *`,
      [
        handler.eventName,
        handler.handlerName,
        handler.handlerService,
        handler.handlerMethod,
        handler.description || null,
        handler.priority || 100,
        handler.isAsync !== false,
        handler.retryCount || 3,
        JSON.stringify(handler.config || {}),
        JSON.stringify(handler.conditions || {}),
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      eventName: row.event_name,
      handlerName: row.handler_name,
      handlerService: row.handler_service,
      handlerMethod: row.handler_method,
      priority: row.priority,
      isAsync: row.is_async,
      retryCount: row.retry_count,
      retryDelayMs: row.retry_delay_ms,
      timeoutMs: row.timeout_ms,
      config: row.config || {},
      conditions: row.conditions || {},
    };
  }

  /**
   * Create a webhook subscription
   */
  async createSubscription(subscription: {
    tenantId: string;
    subscriptionName: string;
    eventName: string;
    eventPattern?: string;
    webhookUrl: string;
    secretKey?: string;
    headers?: Record<string, string>;
    createdBy?: string;
  }): Promise<EventSubscription> {
    const result = await pool.query(
      `INSERT INTO event_subscriptions (
        tenant_id, subscription_name, event_name, event_pattern,
        webhook_url, secret_key, headers, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        subscription.tenantId,
        subscription.subscriptionName,
        subscription.eventName,
        subscription.eventPattern || null,
        subscription.webhookUrl,
        subscription.secretKey || null,
        JSON.stringify(subscription.headers || {}),
        subscription.createdBy || null,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      eventName: row.event_name,
      webhookUrl: row.webhook_url,
      secretKey: row.secret_key,
      isActive: row.is_active,
    };
  }

  /**
   * Get dead letter queue entries
   */
  async getDeadLetterQueue(tenantId: string, limit: number = 50): Promise<any[]> {
    const result = await pool.query(
      `SELECT * FROM event_dead_letter_queue
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY last_failed_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  /**
   * Retry a dead letter queue entry
   */
  async retryDeadLetter(id: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `SELECT * FROM event_dead_letter_queue WHERE id = $1`,
        [id]
      );

      if (!result.rowCount) {
        throw new Error('Dead letter entry not found');
      }

      const entry = result.rows[0];

      // Re-queue the event
      await client.query(
        `INSERT INTO event_queue (tenant_id, event_name, payload, max_attempts)
         VALUES ($1, $2, $3, 3)`,
        [entry.tenant_id, entry.event_name, entry.payload]
      );

      // Mark as requeued
      await client.query(
        `UPDATE event_dead_letter_queue
         SET status = 'requeued', requeued_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get event statistics
   */
  async getEventStats(tenantId: string, hoursBack: number = 24): Promise<any> {
    const result = await pool.query(
      `SELECT
         event_name,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status = 'failed') as failed,
         AVG(processing_duration_ms) FILTER (WHERE status = 'completed') as avg_duration_ms
       FROM event_log
       WHERE tenant_id = $1
         AND triggered_at > NOW() - ($2 || ' hours')::INTERVAL
       GROUP BY event_name
       ORDER BY total DESC`,
      [tenantId, hoursBack]
    );

    return result.rows;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const eventBus = new EventBusService();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Emit an event (convenience function)
 */
export async function emitEvent(event: Event): Promise<EventEmitResult> {
  return eventBus.emit(event);
}

/**
 * Subscribe to an event (convenience function)
 */
export function onEvent(eventName: string, handlerName: string, handler: HandlerFunction): void {
  eventBus.subscribe(eventName, handlerName, handler);
}

// ============================================================================
// PRE-DEFINED EVENT EMITTERS
// ============================================================================

export const EventEmitters = {
  // Appointment Events
  appointmentScheduled: (tenantId: string, appointmentId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'appointment.scheduled',
      payload: { appointmentId, ...data },
      entityType: 'appointment',
      entityId: appointmentId,
    }),

  appointmentCompleted: (tenantId: string, appointmentId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'appointment.completed',
      payload: { appointmentId, ...data },
      entityType: 'appointment',
      entityId: appointmentId,
    }),

  appointmentCancelled: (tenantId: string, appointmentId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'appointment.cancelled',
      payload: { appointmentId, ...data },
      entityType: 'appointment',
      entityId: appointmentId,
    }),

  appointmentNoShow: (tenantId: string, appointmentId: string, patientId: string) =>
    eventBus.emit({
      tenantId,
      eventName: 'appointment.no_show',
      payload: { appointmentId, patientId },
      entityType: 'appointment',
      entityId: appointmentId,
    }),

  // Referral Events
  referralReceived: (tenantId: string, referralId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'referral.received',
      payload: { referralId, ...data },
      entityType: 'referral',
      entityId: referralId,
    }),

  referralScheduled: (tenantId: string, referralId: string, appointmentId: string) =>
    eventBus.emit({
      tenantId,
      eventName: 'referral.scheduled',
      payload: { referralId, appointmentId },
      entityType: 'referral',
      entityId: referralId,
    }),

  referralCompleted: (tenantId: string, referralId: string, encounterId: string) =>
    eventBus.emit({
      tenantId,
      eventName: 'referral.completed',
      payload: { referralId, encounterId },
      entityType: 'referral',
      entityId: referralId,
    }),

  // Billing Events
  claimSubmitted: (tenantId: string, claimId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'claim.submitted',
      payload: { claimId, ...data },
      entityType: 'claim',
      entityId: claimId,
    }),

  claimPaid: (tenantId: string, claimId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'claim.paid',
      payload: { claimId, ...data },
      entityType: 'claim',
      entityId: claimId,
    }),

  claimDenied: (tenantId: string, claimId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'claim.denied',
      payload: { claimId, ...data },
      entityType: 'claim',
      entityId: claimId,
    }),

  paymentReceived: (tenantId: string, paymentId: string, patientId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'payment.received',
      payload: { paymentId, patientId, ...data },
      entityType: 'payment',
      entityId: paymentId,
    }),

  // Clinical Events
  labResultReceived: (tenantId: string, resultId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'lab_result.received',
      payload: { resultId, ...data },
      entityType: 'lab_result',
      entityId: resultId,
    }),

  prescriptionSent: (tenantId: string, prescriptionId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'prescription.sent',
      payload: { prescriptionId, ...data },
      entityType: 'prescription',
      entityId: prescriptionId,
    }),

  treatmentPlanCreated: (tenantId: string, treatmentPlanId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'treatment_plan.created',
      payload: { treatmentPlanId, ...data },
      entityType: 'treatment_plan',
      entityId: treatmentPlanId,
    }),

  // Inventory Events
  inventoryLowStock: (tenantId: string, itemId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'inventory.low_stock',
      payload: { itemId, ...data },
      entityType: 'inventory_item',
      entityId: itemId,
    }),

  inventoryExpired: (tenantId: string, lotId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'inventory.expired',
      payload: { lotId, ...data },
      entityType: 'inventory_lot',
      entityId: lotId,
    }),

  equipmentMaintenanceDue: (tenantId: string, equipmentId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'equipment.maintenance_due',
      payload: { equipmentId, ...data },
      entityType: 'equipment',
      entityId: equipmentId,
    }),

  // Patient Events
  patientCreated: (tenantId: string, patientId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'patient.created',
      payload: { patientId, ...data },
      entityType: 'patient',
      entityId: patientId,
    }),

  patientBirthday: (tenantId: string, patientId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'patient.birthday',
      payload: { patientId, ...data },
      entityType: 'patient',
      entityId: patientId,
    }),

  patientInactive: (tenantId: string, patientId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'patient.inactive',
      payload: { patientId, ...data },
      entityType: 'patient',
      entityId: patientId,
    }),

  // Quality Events
  qualityMeasureGap: (tenantId: string, patientId: string, measureId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'quality_measure.gap_identified',
      payload: { patientId, measureId, ...data },
      entityType: 'quality_measure',
      entityId: measureId,
    }),

  // Staff Events
  staffOvertimeAlert: (tenantId: string, staffId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'staff.overtime_alert',
      payload: { staffId, ...data },
      entityType: 'staff',
      entityId: staffId,
    }),

  staffCredentialExpiring: (tenantId: string, staffId: string, data: EventPayload) =>
    eventBus.emit({
      tenantId,
      eventName: 'staff.credential_expiring',
      payload: { staffId, ...data },
      entityType: 'staff',
      entityId: staffId,
    }),
};
