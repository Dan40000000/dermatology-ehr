/**
 * Reminder Processor Background Job
 * Runs every 5 minutes to process the reminder queue
 */

import { logger } from '../lib/logger';
import {
  processReminderQueue,
  scheduleReminders,
  scheduleNoShowFollowup,
} from '../services/appointmentReminderService';
import { pool } from '../db/pool';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROCESS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes for retries
const MAX_BATCH_SIZE = 100;

let isRunning = false;
let processorInterval: NodeJS.Timeout | null = null;
let retryInterval: NodeJS.Timeout | null = null;

// ============================================================================
// MAIN PROCESSOR
// ============================================================================

/**
 * Process the reminder queue
 */
async function processQueue(): Promise<void> {
  if (isRunning) {
    logger.debug('Reminder processor already running, skipping');
    return;
  }

  isRunning = true;

  try {
    logger.info('Starting reminder queue processing');

    const result = await processReminderQueue();

    logger.info('Reminder queue processing complete', {
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in reminder queue processing', { error: message });
  } finally {
    isRunning = false;
  }
}

/**
 * Process failed reminders that are due for retry
 */
async function processRetries(): Promise<void> {
  try {
    // Find reminders that need retry
    const retryResult = await pool.query(
      `SELECT id, tenant_id, appointment_id, reminder_type, retry_count, max_retries
       FROM reminder_queue
       WHERE status = 'failed'
         AND retry_count < max_retries
         AND next_retry_at IS NOT NULL
         AND next_retry_at <= NOW()
       LIMIT $1`,
      [MAX_BATCH_SIZE]
    );

    if (retryResult.rows.length === 0) {
      return;
    }

    logger.info('Processing reminder retries', { count: retryResult.rows.length });

    // Reset status to pending for retry
    const ids = retryResult.rows.map(r => r.id);
    await pool.query(
      `UPDATE reminder_queue
       SET status = 'pending', next_retry_at = NULL, updated_at = NOW()
       WHERE id = ANY($1)`,
      [ids]
    );

    // Process the queue to send these retries
    await processQueue();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing reminder retries', { error: message });
  }
}

/**
 * Auto-schedule reminders for new appointments
 */
async function autoScheduleNewAppointments(): Promise<void> {
  try {
    // Find appointments in next 72 hours that don't have reminders scheduled
    const result = await pool.query(
      `SELECT DISTINCT a.id, a.tenant_id
       FROM appointments a
       WHERE a.status = 'scheduled'
         AND a.start_time > NOW()
         AND a.start_time <= NOW() + INTERVAL '72 hours'
         AND NOT EXISTS (
           SELECT 1 FROM reminder_queue rq
           WHERE rq.appointment_id = a.id AND rq.status IN ('pending', 'sent')
         )
       LIMIT $1`,
      [MAX_BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      return;
    }

    logger.info('Auto-scheduling reminders for new appointments', { count: result.rows.length });

    for (const appointment of result.rows) {
      try {
        await scheduleReminders(appointment.tenant_id, appointment.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error auto-scheduling reminder', {
          appointmentId: appointment.id,
          error: message,
        });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in auto-schedule process', { error: message });
  }
}

/**
 * Schedule no-show follow-ups for missed appointments
 */
async function scheduleNoShowFollowups(): Promise<void> {
  try {
    // Find no-show appointments from today that don't have follow-ups
    const result = await pool.query(
      `SELECT DISTINCT a.id, a.tenant_id
       FROM appointments a
       WHERE a.status = 'no_show'
         AND DATE(a.start_time) = CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM reminder_queue rq
           WHERE rq.appointment_id = a.id
             AND rq.reminder_category = 'no_show_followup'
             AND rq.status IN ('pending', 'sent')
         )
       LIMIT $1`,
      [MAX_BATCH_SIZE]
    );

    if (result.rows.length === 0) {
      return;
    }

    logger.info('Scheduling no-show follow-ups', { count: result.rows.length });

    for (const appointment of result.rows) {
      try {
        await scheduleNoShowFollowup(appointment.tenant_id, appointment.id);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error scheduling no-show follow-up', {
          appointmentId: appointment.id,
          error: message,
        });
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in no-show follow-up process', { error: message });
  }
}

/**
 * Update statistics table
 */
async function updateStatistics(): Promise<void> {
  try {
    // Aggregate daily statistics
    await pool.query(
      `INSERT INTO reminder_statistics
       (id, tenant_id, date, reminder_category, channel, total_scheduled, total_sent,
        total_delivered, total_failed, total_confirmed, total_cancelled, confirmation_rate, delivery_rate)
      SELECT
        gen_random_uuid()::text,
        rq.tenant_id,
        DATE(rq.created_at),
        rq.reminder_category,
        rq.reminder_type,
        COUNT(*),
        COUNT(*) FILTER (WHERE rq.status = 'sent'),
        COUNT(*) FILTER (WHERE rq.delivery_status = 'delivered'),
        COUNT(*) FILTER (WHERE rq.status = 'failed'),
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM reminder_responses rr
          WHERE rr.reminder_id = rq.id AND rr.response_type = 'confirmed'
        )),
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM reminder_responses rr
          WHERE rr.reminder_id = rq.id AND rr.response_type = 'cancelled'
        )),
        CASE
          WHEN COUNT(*) FILTER (WHERE rq.status = 'sent') > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM reminder_responses rr
              WHERE rr.reminder_id = rq.id AND rr.response_type = 'confirmed'
            ))::numeric /
            COUNT(*) FILTER (WHERE rq.status = 'sent')::numeric * 100, 2
          )
          ELSE 0
        END,
        CASE
          WHEN COUNT(*) FILTER (WHERE rq.status = 'sent') > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE rq.delivery_status = 'delivered')::numeric /
            COUNT(*) FILTER (WHERE rq.status = 'sent')::numeric * 100, 2
          )
          ELSE 0
        END
      FROM reminder_queue rq
      WHERE DATE(rq.created_at) = CURRENT_DATE - INTERVAL '1 day'
      GROUP BY rq.tenant_id, DATE(rq.created_at), rq.reminder_category, rq.reminder_type
      ON CONFLICT (tenant_id, date, reminder_category, channel)
      DO UPDATE SET
        total_scheduled = EXCLUDED.total_scheduled,
        total_sent = EXCLUDED.total_sent,
        total_delivered = EXCLUDED.total_delivered,
        total_failed = EXCLUDED.total_failed,
        total_confirmed = EXCLUDED.total_confirmed,
        total_cancelled = EXCLUDED.total_cancelled,
        confirmation_rate = EXCLUDED.confirmation_rate,
        delivery_rate = EXCLUDED.delivery_rate`
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating reminder statistics', { error: message });
  }
}

/**
 * Full processing cycle
 */
async function runProcessingCycle(): Promise<void> {
  logger.debug('Starting reminder processing cycle');

  try {
    // 1. Process the queue (send due reminders)
    await processQueue();

    // 2. Auto-schedule reminders for new appointments
    await autoScheduleNewAppointments();

    // 3. Schedule no-show follow-ups
    await scheduleNoShowFollowups();

    // 4. Update statistics (once a day, check hour)
    const now = new Date();
    if (now.getHours() === 2 && now.getMinutes() < 10) {
      await updateStatistics();
    }

    logger.debug('Reminder processing cycle complete');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error in reminder processing cycle', { error: message });
  }
}

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Start the reminder processor
 */
export function startReminderProcessor(): void {
  if (processorInterval) {
    logger.warn('Reminder processor already running');
    return;
  }

  logger.info('Starting reminder processor', {
    processInterval: `${PROCESS_INTERVAL_MS / 1000}s`,
    retryInterval: `${RETRY_INTERVAL_MS / 1000}s`,
  });

  // Run immediately on startup
  runProcessingCycle().catch(error => {
    logger.error('Initial processing cycle failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Schedule regular processing
  processorInterval = setInterval(() => {
    runProcessingCycle().catch(error => {
      logger.error('Processing cycle failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }, PROCESS_INTERVAL_MS);

  // Schedule retry processing
  retryInterval = setInterval(() => {
    processRetries().catch(error => {
      logger.error('Retry processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }, RETRY_INTERVAL_MS);

  logger.info('Reminder processor started');
}

/**
 * Stop the reminder processor
 */
export function stopReminderProcessor(): void {
  logger.info('Stopping reminder processor');

  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }

  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }

  logger.info('Reminder processor stopped');
}

/**
 * Check if the processor is running
 */
export function isReminderProcessorRunning(): boolean {
  return processorInterval !== null;
}

/**
 * Manually trigger a processing cycle
 */
export async function triggerProcessingCycle(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const result = await processReminderQueue();
  return result;
}
