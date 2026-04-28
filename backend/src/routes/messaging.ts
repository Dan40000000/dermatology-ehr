import { Router } from "express";
import crypto from "crypto";
import type { Request } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import { auditLog } from "../services/audit";
import { logger } from "../lib/logger";
import { getEmailService } from "../lib/container";

const createThreadSchema = z.object({
  subject: z.string().min(1),
  patientId: z.string().optional(),
  participantIds: z.array(z.string()).default([]),
  externalEmails: z.array(z.string().email()).default([]),
  message: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.participantIds.length === 0 && value.externalEmails.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one internal recipient or external email is required",
      path: ["participantIds"],
    });
  }
});

const sendMessageSchema = z.object({
  body: z.string().min(1),
});

const inboundEmailWebhookSchema = z.object({
  from: z.string().optional(),
  from_email: z.string().optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  body: z.string().optional(),
  html: z.string().optional(),
  headers: z.string().optional(),
  messageId: z.string().optional(),
}).passthrough();

export const messagingRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logMessagingError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function normalizeEmailAddress(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const angleMatch = trimmed.match(/<([^>]+)>/);
  const email = (angleMatch?.[1] || trimmed).trim().toLowerCase();
  if (!email.includes("@")) {
    return undefined;
  }

  return email;
}

function formatFromAddress(fullName?: string, email?: string): string | undefined {
  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedEmail) {
    return undefined;
  }

  const normalizedName = fullName?.replace(/[\r\n"]/g, "").trim();
  if (!normalizedName) {
    return normalizedEmail;
  }

  return `${normalizedName} <${normalizedEmail}>`;
}

function buildThreadReplyToAddress(threadId: string): string | undefined {
  const baseReplyTo = normalizeEmailAddress(
    process.env.MESSAGING_INBOUND_EMAIL || process.env.EMAIL_REPLY_TO
  );
  if (!baseReplyTo) {
    return undefined;
  }

  const atIndex = baseReplyTo.indexOf("@");
  if (atIndex < 1) {
    return undefined;
  }

  const localPart = baseReplyTo.slice(0, atIndex);
  const domain = baseReplyTo.slice(atIndex + 1);
  return `${localPart}+thread-${threadId}@${domain}`;
}

function normalizeInboundToAddresses(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const parts = Array.isArray(value) ? value : value.split(/[,\s]+/);
  const addresses = parts
    .map((part) => normalizeEmailAddress(part))
    .filter((part): part is string => !!part);

  return Array.from(new Set(addresses));
}

function extractThreadIdFromInboundPayload(payload: z.infer<typeof inboundEmailWebhookSchema>): string | undefined {
  const toAddresses = normalizeInboundToAddresses(payload.to);
  for (const address of toAddresses) {
    const aliasMatch = address.match(/\+thread-([a-z0-9-]{8,})@/i);
    if (aliasMatch?.[1]) {
      return aliasMatch[1];
    }
  }

  const subjectMatch = payload.subject?.match(/\[thread:([a-z0-9-]{8,})\]/i);
  if (subjectMatch?.[1]) {
    return subjectMatch[1];
  }

  const bodyContent = payload.text || payload.body || payload.html;
  const bodyMatch = bodyContent?.match(/intramail thread id:\s*([a-z0-9-]{8,})/i);
  if (bodyMatch?.[1]) {
    return bodyMatch[1];
  }

  return undefined;
}

function buildExternalMessageBody(message: string, threadId: string): string {
  return `${message}\n\n---\nIntraMail Thread ID: ${threadId}`;
}

function hasValidWebhookSecret(req: Request): boolean {
  const configuredSecret = process.env.MESSAGING_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return true;
  }

  const headerSecret = req.header("x-messaging-webhook-secret");
  const querySecret = typeof req.query.secret === "string" ? req.query.secret : undefined;
  return headerSecret === configuredSecret || querySecret === configuredSecret;
}

async function ensureExternalEmailGatewayUser(client: { query: (query: string, params?: unknown[]) => Promise<any> }, tenantId: string) {
  const gatewayUserId = `external-email-gateway-${tenantId}`;
  const gatewayEmail = `external-email-gateway+${tenantId}@intra.local`;

  await client.query(
    `insert into users(id, tenant_id, email, full_name, role, password_hash)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [gatewayUserId, tenantId, gatewayEmail, "External Email Gateway", "staff", "external-email-gateway"]
  );

  return gatewayUserId;
}

// POST /api/messaging/webhook/email - Inbound email replies for IntraMail threads
messagingRouter.post("/webhook/email", async (req, res) => {
  if (!hasValidWebhookSecret(req)) {
    return res.status(403).json({ error: "Invalid webhook credentials" });
  }

  const parsed = inboundEmailWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const payload = parsed.data;
  const senderEmail = normalizeEmailAddress(payload.from_email || payload.from);
  const threadId = extractThreadIdFromInboundPayload(payload);
  const inboundBody = (payload.text || payload.body || "").trim();

  if (!senderEmail || !threadId || !inboundBody) {
    return res.status(200).json({
      success: true,
      ignored: true,
      reason: "Missing sender, thread id, or message body",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const threadResult = await client.query(
      `select id, tenant_id as "tenantId"
       from message_threads
       where id = $1`,
      [threadId]
    );

    if (threadResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(200).json({
        success: true,
        ignored: true,
        reason: "Unknown thread",
      });
    }

    const tenantId: string = threadResult.rows[0].tenantId;

    const senderUserResult = await client.query(
      `select id
       from users
       where tenant_id = $1 and lower(email) = lower($2)
       limit 1`,
      [tenantId, senderEmail]
    );

    const senderId =
      senderUserResult.rows[0]?.id || (await ensureExternalEmailGatewayUser(client, tenantId));
    const messageBody =
      senderUserResult.rows.length > 0
        ? inboundBody
        : `From: ${senderEmail}\n\n${inboundBody}`;
    const messageId = crypto.randomUUID();

    await client.query(
      `insert into thread_messages(id, tenant_id, thread_id, body, sender_id)
       values ($1, $2, $3, $4, $5)`,
      [messageId, tenantId, threadId, messageBody, senderId]
    );

    await client.query(
      `update message_threads
       set updated_at = now()
       where id = $1`,
      [threadId]
    );

    await client.query("COMMIT");

    logger.info("Inbound email reply mapped to IntraMail thread", {
      threadId,
      senderEmail,
      messageId,
    });

    return res.status(201).json({ success: true, threadId, messageId });
  } catch (err) {
    await client.query("ROLLBACK");
    logMessagingError("Error processing inbound email webhook:", err);
    return res.status(500).json({ error: "Failed to process inbound email" });
  } finally {
    client.release();
  }
});

// GET /api/messaging/recipients - List internal recipients for compose
messagingRouter.use(requireAuth, requireModuleAccess("mail"));

messagingRouter.get("/recipients", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const currentUserId = req.user!.id;

  try {
    const result = await pool.query(
      `select
        id,
        full_name as "fullName",
        email,
        role
      from users
      where tenant_id = $1
        and id != $2
        and id not like 'external-email-gateway-%'
      order by full_name`,
      [tenantId, currentUserId]
    );

    res.json({ recipients: result.rows });
  } catch (err) {
    logMessagingError("Error fetching message recipients:", err);
    res.status(500).json({ error: "Failed to fetch recipients" });
  }
});

// GET /api/messaging/threads - List threads (inbox/sent/archived)
messagingRouter.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const filter = (req.query.filter as string) || 'inbox'; // inbox, sent, archived

  try {
    // Auto-archive stale threads for this participant after 6 months of inactivity.
    await pool.query(
      `update message_participants mp
       set is_archived = true
       from message_threads mt
       where mp.thread_id = mt.id
         and mp.tenant_id = $1
         and mp.user_id = $2
         and mp.is_archived = false
         and mt.tenant_id = $1
         and mt.updated_at < now() - interval '6 months'`,
      [tenantId, userId]
    );

    let query = `
      select
        mt.id,
        mt.subject,
        mt.patient_id as "patientId",
        mt.created_by as "createdBy",
        cu.full_name as "createdByName",
        cu.email as "createdByEmail",
        coalesce(mt.external_recipients, '[]'::jsonb) as "externalRecipients",
        mt.created_at as "createdAt",
        mt.updated_at as "updatedAt",
        mp.is_archived as "isArchived",
        mp.last_read_at as "lastReadAt",
        (
          select count(*)
          from thread_messages tm
          where tm.thread_id = mt.id
            and tm.sender_id != $2
            and (tm.created_at > mp.last_read_at or mp.last_read_at is null)
        ) as "unreadCount",
        (
          select json_agg(json_build_object(
            'id', u.id,
            'firstName', split_part(u.full_name, ' ', 1),
            'lastName', coalesce(nullif(trim(regexp_replace(u.full_name, '^\\S+\\s*', '')), ''), ''),
            'email', u.email
          ))
          from message_participants mp2
          join users u on u.id = mp2.user_id
          where mp2.thread_id = mt.id
        ) as participants,
        (
          select json_build_object(
            'id', last_msg.id,
            'body', left(last_msg.body, 100),
            'sender', last_msg.sender_id,
            'createdAt', last_msg.created_at
          )
          from thread_messages last_msg
          where last_msg.thread_id = mt.id
          order by last_msg.created_at desc
          limit 1
        ) as "lastMessage",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName"
      from message_threads mt
      join message_participants mp on mp.thread_id = mt.id and mp.user_id = $2
      left join users cu on cu.id = mt.created_by
      left join patients p on p.id = mt.patient_id
      where mt.tenant_id = $1
    `;

    const params: any[] = [tenantId, userId];

    if (filter === 'inbox') {
      query += ` and mp.is_archived = false and (
        mt.created_by != $2
        or exists (
          select 1
          from thread_messages tm_inbox_any
          where tm_inbox_any.thread_id = mt.id
            and tm_inbox_any.sender_id != $2
        )
      )`;
    } else if (filter === 'sent') {
      query += ` and mt.created_by = $2 and mp.is_archived = false`;
    } else if (filter === 'archived') {
      query += ` and mp.is_archived = true`;
    }

    query += ` order by mt.updated_at desc limit 100`;

    const result = await pool.query(query, params);
    res.json({ threads: result.rows });
  } catch (err) {
    logMessagingError("Error fetching threads:", err);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

// GET /api/messaging/threads/:id - Get thread with messages
messagingRouter.get("/threads/:id", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const threadId = req.params.id;

  try {
    // Get thread details
    const threadResult = await pool.query(
      `select
        mt.id,
        mt.subject,
        mt.patient_id as "patientId",
        mt.created_by as "createdBy",
        cu.full_name as "createdByName",
        cu.email as "createdByEmail",
        coalesce(mt.external_recipients, '[]'::jsonb) as "externalRecipients",
        mt.created_at as "createdAt",
        mp.is_archived as "isArchived",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName",
        (
          select json_agg(json_build_object(
            'id', u.id,
            'firstName', split_part(u.full_name, ' ', 1),
            'lastName', coalesce(nullif(trim(regexp_replace(u.full_name, '^\\S+\\s*', '')), ''), ''),
            'email', u.email
          ))
          from message_participants mp2
          join users u on u.id = mp2.user_id
          where mp2.thread_id = mt.id
        ) as participants
      from message_threads mt
      join message_participants mp on mp.thread_id = mt.id and mp.user_id = $2
      left join users cu on cu.id = mt.created_by
      left join patients p on p.id = mt.patient_id
      where mt.id = $3 and mt.tenant_id = $1`,
      [tenantId, userId, threadId]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Get messages in thread
    const messagesResult = await pool.query(
      `select
        tm.id,
        tm.body,
        tm.sender_id as sender,
        tm.created_at as "createdAt",
        split_part(u.full_name, ' ', 1) as "senderFirstName",
        coalesce(nullif(trim(regexp_replace(u.full_name, '^\\S+\\s*', '')), ''), '') as "senderLastName"
      from thread_messages tm
      left join users u on u.id = tm.sender_id
      where tm.thread_id = $1
      order by tm.created_at asc`,
      [threadId]
    );

    res.json({
      thread: threadResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (err) {
    logMessagingError("Error fetching thread:", err);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// POST /api/messaging/threads - Create new thread
messagingRouter.post("/threads", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { subject, patientId, participantIds, externalEmails, message } = parsed.data;
  const uniqueParticipantIds = Array.from(
    new Set(
      participantIds
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id) && id !== userId)
    )
  );
  const senderFrom = formatFromAddress(
    process.env.MESSAGING_FROM_NAME || process.env.FROM_NAME || req.user?.fullName,
    process.env.MESSAGING_FROM_EMAIL || process.env.FROM_EMAIL || req.user?.email,
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (uniqueParticipantIds.length > 0) {
      const validParticipantsResult = await client.query(
        `select id
         from users
         where tenant_id = $1
           and id = any($2::text[])`,
        [tenantId, uniqueParticipantIds]
      );

      const validParticipantIds = new Set(
        validParticipantsResult.rows.map((row: { id: string }) => row.id)
      );

      const invalidParticipantIds = uniqueParticipantIds.filter((id) => !validParticipantIds.has(id));
      if (invalidParticipantIds.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: "One or more internal recipients are invalid",
          invalidParticipantIds,
        });
      }
    }

    // Create thread
    const threadId = crypto.randomUUID();
    await client.query(
      `insert into message_threads(id, tenant_id, subject, patient_id, created_by, external_recipients)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [threadId, tenantId, subject, patientId || null, userId, JSON.stringify(externalEmails)]
    );

    // Add creator as participant
    const creatorParticipantId = crypto.randomUUID();
    await client.query(
      `insert into message_participants(id, tenant_id, thread_id, user_id)
       values ($1, $2, $3, $4)`,
      [creatorParticipantId, tenantId, threadId, userId]
    );

    // Add other participants
    for (const participantId of uniqueParticipantIds) {
      const participantIdUUID = crypto.randomUUID();
      await client.query(
        `insert into message_participants(id, tenant_id, thread_id, user_id)
         values ($1, $2, $3, $4)`,
        [participantIdUUID, tenantId, threadId, participantId]
      );
    }

    // Create first message
    const messageId = crypto.randomUUID();
    await client.query(
      `insert into thread_messages(id, tenant_id, thread_id, body, sender_id)
       values ($1, $2, $3, $4, $5)`,
      [messageId, tenantId, threadId, message, userId]
    );

    await client.query('COMMIT');
    await auditLog(tenantId, userId, "thread_create", "message_thread", threadId);

    let externalEmailStatus:
      | {
          requested: string[];
          accepted: string[];
          rejected: string[];
          messageId?: string;
          error?: string;
        }
      | undefined;

    if (externalEmails.length > 0) {
      try {
        const replyTo = buildThreadReplyToAddress(threadId);
        const emailResult = await getEmailService().sendEmail({
          to: externalEmails,
          subject,
          text: buildExternalMessageBody(message, threadId),
          ...(senderFrom ? { from: senderFrom } : {}),
          ...(replyTo ? { replyTo } : {}),
        });

        externalEmailStatus = {
          requested: externalEmails,
          accepted: emailResult.accepted,
          rejected: emailResult.rejected,
          messageId: emailResult.messageId,
        };
      } catch (emailError) {
        const safeError = toSafeErrorMessage(emailError);
        logMessagingError("Error sending external email recipients:", emailError);
        externalEmailStatus = {
          requested: externalEmails,
          accepted: [],
          rejected: externalEmails,
          error: safeError,
        };
      }
    }

    res.status(201).json({
      id: threadId,
      ...(externalEmailStatus ? { externalEmail: externalEmailStatus } : {}),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logMessagingError("Error creating thread:", err);
    res.status(500).json({ error: 'Failed to create thread' });
  } finally {
    client.release();
  }
});

// POST /api/messaging/threads/:id/messages - Send message in thread
messagingRouter.post("/threads/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const threadId = req.params.id;
  const { body } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify user is a participant
    const participantCheck = await client.query(
      `select id from message_participants where thread_id = $1 and user_id = $2`,
      [threadId, userId]
    );

    if (participantCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a participant of this thread' });
    }

    // Create message
    const messageId = crypto.randomUUID();
    await client.query(
      `insert into thread_messages(id, tenant_id, thread_id, body, sender_id)
       values ($1, $2, $3, $4, $5)`,
      [messageId, tenantId, threadId, body, userId]
    );

    // Update thread timestamp
    await client.query(
      `update message_threads set updated_at = now() where id = $1`,
      [threadId]
    );

    await client.query('COMMIT');
    await auditLog(tenantId, userId, "message_send", "message", messageId);

    res.status(201).json({ id: messageId });
  } catch (err) {
    await client.query('ROLLBACK');
    logMessagingError("Error sending message:", err);
    res.status(500).json({ error: 'Failed to send message' });
  } finally {
    client.release();
  }
});

// PUT /api/messaging/threads/:id/read - Mark thread as read
messagingRouter.put("/threads/:id/read", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const threadId = req.params.id;

  try {
    await pool.query(
      `update message_participants
       set last_read_at = now()
       where thread_id = $1 and user_id = $2`,
      [threadId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    logMessagingError("Error marking thread as read:", err);
    res.status(500).json({ error: 'Failed to mark thread as read' });
  }
});

// PUT /api/messaging/threads/:id/archive - Archive/unarchive thread
messagingRouter.put("/threads/:id/archive", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const threadId = req.params.id;
  const { archive } = req.body;

  try {
    await pool.query(
      `update message_participants
       set is_archived = $3
       where thread_id = $1 and user_id = $2`,
      [threadId, userId, archive !== false]
    );

    res.json({ success: true });
  } catch (err) {
    logMessagingError("Error archiving thread:", err);
    res.status(500).json({ error: 'Failed to archive thread' });
  }
});

// GET /api/messaging/unread-count - Get unread count
messagingRouter.get("/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;

  try {
    const result = await pool.query(
      `select count(distinct mt.id) as count
       from message_threads mt
       join message_participants mp on mp.thread_id = mt.id and mp.user_id = $2
       where mt.tenant_id = $1
         and mp.is_archived = false
         and exists (
           select 1
           from thread_messages tm
           where tm.thread_id = mt.id
             and tm.sender_id != $2
             and (tm.created_at > mp.last_read_at or mp.last_read_at is null)
         )`,
      [tenantId, userId]
    );

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    logMessagingError("Error fetching unread count:", err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});
