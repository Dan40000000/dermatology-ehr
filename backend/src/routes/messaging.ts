import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";

const createThreadSchema = z.object({
  subject: z.string().min(1),
  patientId: z.string().optional(),
  participantIds: z.array(z.string()).min(1),
  message: z.string().min(1),
});

const sendMessageSchema = z.object({
  body: z.string().min(1),
});

export const messagingRouter = Router();

// GET /api/messaging/threads - List threads (inbox/sent/archived)
messagingRouter.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const filter = (req.query.filter as string) || 'inbox'; // inbox, sent, archived

  try {
    let query = `
      select distinct
        mt.id,
        mt.subject,
        mt.patient_id as "patientId",
        mt.created_by as "createdBy",
        mt.created_at as "createdAt",
        mt.updated_at as "updatedAt",
        mp.is_archived as "isArchived",
        mp.last_read_at as "lastReadAt",
        (
          select count(*)
          from messages m
          where m.thread_id = mt.id
            and m.sender != $2
            and (m.created_at > mp.last_read_at or mp.last_read_at is null)
        ) as "unreadCount",
        (
          select json_agg(json_build_object(
            'id', u.id,
            'firstName', u.first_name,
            'lastName', u.last_name,
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
            'sender', last_msg.sender,
            'createdAt', last_msg.created_at
          )
          from messages last_msg
          where last_msg.thread_id = mt.id
          order by last_msg.created_at desc
          limit 1
        ) as "lastMessage",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName"
      from message_threads mt
      join message_participants mp on mp.thread_id = mt.id and mp.user_id = $2
      left join patients p on p.id = mt.patient_id
      where mt.tenant_id = $1
    `;

    const params: any[] = [tenantId, userId];

    if (filter === 'inbox') {
      query += ` and mp.is_archived = false and mt.created_by != $2`;
    } else if (filter === 'sent') {
      query += ` and mt.created_by = $2`;
    } else if (filter === 'archived') {
      query += ` and mp.is_archived = true`;
    }

    query += ` order by mt.updated_at desc limit 100`;

    const result = await pool.query(query, params);
    res.json({ threads: result.rows });
  } catch (err) {
    console.error('Error fetching threads:', err);
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
        mt.created_at as "createdAt",
        mp.is_archived as "isArchived",
        p.first_name as "patientFirstName",
        p.last_name as "patientLastName",
        (
          select json_agg(json_build_object(
            'id', u.id,
            'firstName', u.first_name,
            'lastName', u.last_name,
            'email', u.email
          ))
          from message_participants mp2
          join users u on u.id = mp2.user_id
          where mp2.thread_id = mt.id
        ) as participants
      from message_threads mt
      join message_participants mp on mp.thread_id = mt.id and mp.user_id = $2
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
        m.id,
        m.body,
        m.sender,
        m.created_at as "createdAt",
        u.first_name as "senderFirstName",
        u.last_name as "senderLastName"
      from messages m
      left join users u on u.id = m.sender
      where m.thread_id = $1
      order by m.created_at asc`,
      [threadId]
    );

    res.json({
      thread: threadResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (err) {
    console.error('Error fetching thread:', err);
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
  const { subject, patientId, participantIds, message } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create thread
    const threadId = crypto.randomUUID();
    await client.query(
      `insert into message_threads(id, tenant_id, subject, patient_id, created_by)
       values ($1, $2, $3, $4, $5)`,
      [threadId, tenantId, subject, patientId || null, userId]
    );

    // Add creator as participant
    const creatorParticipantId = crypto.randomUUID();
    await client.query(
      `insert into message_participants(id, thread_id, user_id)
       values ($1, $2, $3)`,
      [creatorParticipantId, threadId, userId]
    );

    // Add other participants
    for (const participantId of participantIds) {
      if (participantId !== userId) {
        const participantIdUUID = crypto.randomUUID();
        await client.query(
          `insert into message_participants(id, thread_id, user_id)
           values ($1, $2, $3)`,
          [participantIdUUID, threadId, participantId]
        );
      }
    }

    // Create first message
    const messageId = crypto.randomUUID();
    await client.query(
      `insert into messages(id, tenant_id, thread_id, body, sender)
       values ($1, $2, $3, $4, $5)`,
      [messageId, tenantId, threadId, message, userId]
    );

    await client.query('COMMIT');
    await auditLog(tenantId, userId, "thread_create", "message_thread", threadId);

    res.status(201).json({ id: threadId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating thread:', err);
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
      `insert into messages(id, tenant_id, thread_id, body, sender)
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
    console.error('Error sending message:', err);
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
    console.error('Error marking thread as read:', err);
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
    console.error('Error archiving thread:', err);
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
           from messages m
           where m.thread_id = mt.id
             and m.sender != $2
             and (m.created_at > mp.last_read_at or mp.last_read_at is null)
         )`,
      [tenantId, userId]
    );

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});
