import { pool } from "../db/pool";
import { parseHL7Message, validateHL7Message } from "./hl7Parser";
import { processHL7Message } from "./hl7Processor";
import crypto from "crypto";

/**
 * HL7 Queue Service
 * Background processing for HL7 messages with retry logic
 */

export interface QueuedMessage {
  id: string;
  tenantId: string;
  messageType: string;
  messageControlId: string;
  sendingApplication: string;
  sendingFacility: string;
  rawMessage: string;
  parsedData: any;
  status: "pending" | "processing" | "processed" | "failed";
  errorMessage?: string;
  processedAt?: Date;
  retryCount: number;
  createdAt: Date;
}

/**
 * Enqueue an HL7 message for processing
 */
export async function enqueueHL7Message(rawMessage: string, tenantId: string): Promise<string> {
  const client = await pool.connect();

  try {
    // Parse the message
    const parsed = parseHL7Message(rawMessage);

    // Validate the message
    const validation = validateHL7Message(parsed);
    if (!validation.valid) {
      throw new Error(`Invalid HL7 message: ${validation.errors.join(", ")}`);
    }

    const messageId = crypto.randomUUID();

    await client.query(
      `INSERT INTO hl7_messages (
        id, tenant_id, message_type, message_control_id,
        sending_application, sending_facility,
        raw_message, parsed_data, status, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        messageId,
        tenantId,
        parsed.messageType,
        parsed.messageControlId,
        parsed.sendingApplication,
        parsed.sendingFacility,
        rawMessage,
        JSON.stringify(parsed),
        "pending",
        0,
      ]
    );

    return messageId;
  } finally {
    client.release();
  }
}

/**
 * Process pending messages in the queue
 */
export async function processPendingMessages(batchSize: number = 10): Promise<void> {
  const client = await pool.connect();

  try {
    // Get pending messages ordered by creation time (FIFO)
    const result = await client.query(
      `SELECT id, tenant_id, raw_message, parsed_data, retry_count
       FROM hl7_messages
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    for (const row of result.rows) {
      await processQueuedMessage(row.id, row.tenant_id, row.parsed_data, row.retry_count);
    }
  } finally {
    client.release();
  }
}

/**
 * Process a single queued message
 */
async function processQueuedMessage(messageId: string, tenantId: string, parsedData: any, retryCount: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Mark as processing
    await client.query(`UPDATE hl7_messages SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [messageId]);

    // Process the message
    const result = await processHL7Message(parsedData, tenantId);

    if (result.success) {
      // Mark as processed
      await client.query(
        `UPDATE hl7_messages
         SET status = 'processed',
             processed_at = CURRENT_TIMESTAMP,
             error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [messageId]
      );
    } else {
      // Check if we should retry
      const maxRetries = 3;
      const shouldRetry = retryCount < maxRetries;

      if (shouldRetry) {
        // Reset to pending for retry with exponential backoff
        const backoffSeconds = Math.pow(2, retryCount) * 60; // 1 min, 2 min, 4 min
        await client.query(
          `UPDATE hl7_messages
           SET status = 'pending',
               retry_count = retry_count + 1,
               error_message = $1,
               next_retry_at = CURRENT_TIMESTAMP + INTERVAL '${backoffSeconds} seconds',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [result.error, messageId]
        );
      } else {
        // Mark as permanently failed
        await client.query(
          `UPDATE hl7_messages
           SET status = 'failed',
               error_message = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [result.error, messageId]
        );
      }
    }
  } catch (error) {
    // Unexpected error - mark as failed
    await client.query(
      `UPDATE hl7_messages
       SET status = 'failed',
           error_message = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [error instanceof Error ? error.message : String(error), messageId]
    );
  } finally {
    client.release();
  }
}

/**
 * Retry a specific failed message
 */
export async function retryFailedMessage(messageId: string, tenantId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE hl7_messages
     SET status = 'pending',
         retry_count = 0,
         error_message = NULL,
         next_retry_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 AND status = 'failed'
     RETURNING id`,
    [messageId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new Error("Message not found or not in failed status");
  }
}

/**
 * Get message statistics
 */
export async function getQueueStatistics(tenantId: string): Promise<{
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  total: number;
}> {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending') as pending,
       COUNT(*) FILTER (WHERE status = 'processing') as processing,
       COUNT(*) FILTER (WHERE status = 'processed') as processed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) as total
     FROM hl7_messages
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const row = result.rows[0];
  return {
    pending: parseInt(row.pending, 10),
    processing: parseInt(row.processing, 10),
    processed: parseInt(row.processed, 10),
    failed: parseInt(row.failed, 10),
    total: parseInt(row.total, 10),
  };
}

/**
 * Get queued messages with pagination
 */
export async function getQueuedMessages(
  tenantId: string,
  options: {
    status?: "pending" | "processing" | "processed" | "failed";
    messageType?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ messages: QueuedMessage[]; total: number }> {
  const { status, messageType, limit = 50, offset = 0 } = options;

  const conditions: string[] = ["tenant_id = $1"];
  const params: any[] = [tenantId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (messageType) {
    params.push(messageType);
    conditions.push(`message_type = $${params.length}`);
  }

  const whereClause = conditions.join(" AND ");

  // Get total count
  const countResult = await pool.query(`SELECT COUNT(*) as total FROM hl7_messages WHERE ${whereClause}`, params);

  const total = parseInt(countResult.rows[0].total, 10);

  // Get paginated messages
  params.push(limit);
  params.push(offset);

  const result = await pool.query(
    `SELECT
       id, tenant_id, message_type, message_control_id,
       sending_application, sending_facility,
       raw_message, parsed_data, status, error_message,
       processed_at, retry_count, created_at, updated_at
     FROM hl7_messages
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const messages: QueuedMessage[] = result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    messageType: row.message_type,
    messageControlId: row.message_control_id,
    sendingApplication: row.sending_application,
    sendingFacility: row.sending_facility,
    rawMessage: row.raw_message,
    parsedData: row.parsed_data,
    status: row.status,
    errorMessage: row.error_message,
    processedAt: row.processed_at,
    retryCount: row.retry_count,
    createdAt: row.created_at,
  }));

  return { messages, total };
}

/**
 * Get a specific message by ID
 */
export async function getMessageById(messageId: string, tenantId: string): Promise<QueuedMessage | null> {
  const result = await pool.query(
    `SELECT
       id, tenant_id, message_type, message_control_id,
       sending_application, sending_facility,
       raw_message, parsed_data, status, error_message,
       processed_at, retry_count, created_at, updated_at
     FROM hl7_messages
     WHERE id = $1 AND tenant_id = $2`,
    [messageId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    messageType: row.message_type,
    messageControlId: row.message_control_id,
    sendingApplication: row.sending_application,
    sendingFacility: row.sending_facility,
    rawMessage: row.raw_message,
    parsedData: row.parsed_data,
    status: row.status,
    errorMessage: row.error_message,
    processedAt: row.processed_at,
    retryCount: row.retry_count,
    createdAt: row.created_at,
  };
}

/**
 * Start background queue processor
 * This should be called on application startup
 */
export function startQueueProcessor(intervalMs: number = 30000): NodeJS.Timeout {
  console.log(`Starting HL7 queue processor (interval: ${intervalMs}ms)`);

  return setInterval(async () => {
    try {
      await processPendingMessages();
    } catch (error) {
      console.error("Error processing HL7 queue:", error);
    }
  }, intervalMs);
}

/**
 * Process retry queue - messages that are due for retry
 */
export async function processRetryQueue(): Promise<void> {
  const result = await pool.query(
    `UPDATE hl7_messages
     SET status = 'pending'
     WHERE status = 'pending'
     AND next_retry_at IS NOT NULL
     AND next_retry_at <= CURRENT_TIMESTAMP
     RETURNING id`
  );

  if (result.rows.length > 0) {
    console.log(`Reset ${result.rows.length} messages for retry`);
  }
}
