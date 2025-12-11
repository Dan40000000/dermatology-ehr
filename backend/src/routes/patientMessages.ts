import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { auditLog } from "../services/audit";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const router = Router();

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/message-attachments/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: JPG, PNG, GIF, PDF, DOC, DOCX"));
    }
  },
});

// Validation schemas
const createThreadSchema = z.object({
  patientId: z.string().uuid(),
  subject: z.string().min(1).max(500),
  category: z.enum(["general", "prescription", "appointment", "billing", "medical", "other"]),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  messageText: z.string().min(1),
});

const updateThreadSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  status: z.enum(["open", "in-progress", "waiting-patient", "waiting-provider", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

const sendMessageSchema = z.object({
  messageText: z.string().min(1),
  isInternalNote: z.boolean().optional().default(false),
});

// GET /api/patient-messages/threads - List all message threads (staff view)
router.get("/threads", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Query parameters for filtering
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const assignedTo = req.query.assignedTo as string | undefined;
    const priority = req.query.priority as string | undefined;
    const unreadOnly = req.query.unreadOnly === "true";
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        t.id,
        t.patient_id as "patientId",
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.assigned_to as "assignedTo",
        t.assigned_at as "assignedAt",
        t.created_by_patient as "createdByPatient",
        t.last_message_at as "lastMessageAt",
        t.last_message_by as "lastMessageBy",
        t.is_read_by_staff as "isReadByStaff",
        t.read_by_staff_at as "readByStaffAt",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt",
        p.first_name || ' ' || p.last_name as "patientName",
        p.mrn as "patientMrn",
        u.name as "assignedToName",
        (SELECT COUNT(*) FROM patient_messages WHERE thread_id = t.id AND is_internal_note = false) as "messageCount",
        (SELECT message_text FROM patient_messages WHERE thread_id = t.id AND is_internal_note = false ORDER BY sent_at DESC LIMIT 1) as "lastMessagePreview"
      FROM patient_message_threads t
      LEFT JOIN patients p ON t.patient_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (category) {
      query += ` AND t.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (status) {
      query += ` AND t.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (assignedTo) {
      query += ` AND t.assigned_to = $${paramIndex}`;
      params.push(assignedTo);
      paramIndex++;
    }

    if (priority) {
      query += ` AND t.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (unreadOnly) {
      query += ` AND t.is_read_by_staff = false`;
    }

    if (search) {
      query += ` AND (t.subject ILIKE $${paramIndex} OR p.first_name || ' ' || p.last_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY t.last_message_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM patient_message_threads t LEFT JOIN patients p ON t.patient_id = p.id WHERE t.tenant_id = $1`;
    const countParams: any[] = [tenantId];
    let countParamIndex = 2;

    if (category) {
      countQuery += ` AND t.category = $${countParamIndex}`;
      countParams.push(category);
      countParamIndex++;
    }
    if (status) {
      countQuery += ` AND t.status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }
    if (assignedTo) {
      countQuery += ` AND t.assigned_to = $${countParamIndex}`;
      countParams.push(assignedTo);
      countParamIndex++;
    }
    if (priority) {
      countQuery += ` AND t.priority = $${countParamIndex}`;
      countParams.push(priority);
      countParamIndex++;
    }
    if (unreadOnly) {
      countQuery += ` AND t.is_read_by_staff = false`;
    }
    if (search) {
      countQuery += ` AND (t.subject ILIKE $${countParamIndex} OR p.first_name || ' ' || p.last_name ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    await auditLog(tenantId, userId, "patient_message_threads_list", "patient_message_thread", null);

    res.json({
      threads: result.rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching message threads:", error);
    res.status(500).json({ error: "Failed to fetch message threads" });
  }
});

// GET /api/patient-messages/threads/:id - Get single thread with all messages
router.get("/threads/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const threadId = req.params.id;

    // Get thread details
    const threadResult = await pool.query(
      `SELECT
        t.*,
        p.first_name || ' ' || p.last_name as "patientName",
        p.mrn as "patientMrn",
        p.date_of_birth as "patientDob",
        p.email as "patientEmail",
        p.phone as "patientPhone",
        u.name as "assignedToName"
      FROM patient_message_threads t
      LEFT JOIN patients p ON t.patient_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = $1 AND t.tenant_id = $2`,
      [threadId, tenantId]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const thread = threadResult.rows[0];

    // Get all messages in thread
    const messagesResult = await pool.query(
      `SELECT
        m.*,
        CASE
          WHEN m.sender_type = 'staff' THEN u.name
          WHEN m.sender_type = 'patient' THEN p.first_name || ' ' || p.last_name
          ELSE m.sender_name
        END as "senderName",
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', a.id,
            'filename', a.filename,
            'originalFilename', a.original_filename,
            'fileSize', a.file_size,
            'mimeType', a.mime_type
          ))
          FROM patient_message_attachments a
          WHERE a.message_id = m.id),
          '[]'
        ) as attachments
      FROM patient_messages m
      LEFT JOIN users u ON m.sender_user_id = u.id
      LEFT JOIN patients p ON m.sender_patient_id = p.id
      WHERE m.thread_id = $1
      ORDER BY m.sent_at ASC`,
      [threadId]
    );

    await auditLog(tenantId, userId, "patient_message_thread_view", "patient_message_thread", threadId);

    res.json({
      thread,
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error("Error fetching thread:", error);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

// POST /api/patient-messages/threads - Create new thread (staff-initiated)
router.post("/threads", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.name;

    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { patientId, subject, category, priority, messageText } = parsed.data;

    // Verify patient exists and belongs to tenant
    const patientCheck = await pool.query(
      "SELECT id FROM patients WHERE id = $1 AND tenant_id = $2",
      [patientId, tenantId]
    );

    if (patientCheck.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create thread
      const threadId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_message_threads
        (id, tenant_id, patient_id, subject, category, priority, status, created_by_patient, last_message_by, assigned_to, assigned_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'open', false, 'staff', $7, CURRENT_TIMESTAMP)`,
        [threadId, tenantId, patientId, subject, category, priority, userId]
      );

      // Create first message
      const messageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_messages
        (id, thread_id, sender_type, sender_user_id, sender_name, message_text, delivered_to_patient)
        VALUES ($1, $2, 'staff', $3, $4, $5, true)`,
        [messageId, threadId, userId, userName, messageText]
      );

      await client.query("COMMIT");

      await auditLog(tenantId, userId, "patient_message_thread_create", "patient_message_thread", threadId);
      await auditLog(tenantId, userId, "patient_message_send", "patient_message", messageId);

      res.status(201).json({ threadId, messageId });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

// PUT /api/patient-messages/threads/:id - Update thread (assign, status, priority)
router.put("/threads/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const threadId = req.params.id;

    const parsed = updateThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (parsed.data.assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex}, assigned_at = CURRENT_TIMESTAMP`);
      params.push(parsed.data.assignedTo);
      paramIndex++;
    }

    if (parsed.data.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(parsed.data.status);
      paramIndex++;
    }

    if (parsed.data.priority !== undefined) {
      updates.push(`priority = $${paramIndex}`);
      params.push(parsed.data.priority);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(threadId, tenantId);
    const query = `UPDATE patient_message_threads SET ${updates.join(", ")} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    await auditLog(tenantId, userId, "patient_message_thread_update", "patient_message_thread", threadId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating thread:", error);
    res.status(500).json({ error: "Failed to update thread" });
  }
});

// POST /api/patient-messages/threads/:id/messages - Send message in thread
router.post("/threads/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.name;
    const threadId = req.params.id;

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { messageText, isInternalNote } = parsed.data;

    // Verify thread exists
    const threadCheck = await pool.query(
      "SELECT id FROM patient_message_threads WHERE id = $1 AND tenant_id = $2",
      [threadId, tenantId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create message
      const messageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_messages
        (id, thread_id, sender_type, sender_user_id, sender_name, message_text, is_internal_note, delivered_to_patient)
        VALUES ($1, $2, 'staff', $3, $4, $5, $6, $7)`,
        [messageId, threadId, userId, userName, messageText, isInternalNote, !isInternalNote]
      );

      // Update thread
      if (!isInternalNote) {
        await client.query(
          `UPDATE patient_message_threads
          SET last_message_at = CURRENT_TIMESTAMP,
              last_message_by = 'staff',
              is_read_by_patient = false,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
          [threadId]
        );
      }

      await client.query("COMMIT");

      await auditLog(tenantId, userId, "patient_message_send", "patient_message", messageId);

      res.status(201).json({ messageId });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// POST /api/patient-messages/threads/:id/close - Close thread
router.post("/threads/:id/close", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const threadId = req.params.id;

    const result = await pool.query(
      `UPDATE patient_message_threads
      SET status = 'closed', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2`,
      [threadId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    await auditLog(tenantId, userId, "patient_message_thread_close", "patient_message_thread", threadId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error closing thread:", error);
    res.status(500).json({ error: "Failed to close thread" });
  }
});

// POST /api/patient-messages/threads/:id/reopen - Reopen thread
router.post("/threads/:id/reopen", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const threadId = req.params.id;

    const result = await pool.query(
      `UPDATE patient_message_threads
      SET status = 'open', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND tenant_id = $2`,
      [threadId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    await auditLog(tenantId, userId, "patient_message_thread_reopen", "patient_message_thread", threadId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error reopening thread:", error);
    res.status(500).json({ error: "Failed to reopen thread" });
  }
});

// POST /api/patient-messages/threads/:id/mark-read - Mark thread as read by staff
router.post("/threads/:id/mark-read", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const threadId = req.params.id;

    const result = await pool.query(
      `UPDATE patient_message_threads
      SET is_read_by_staff = true,
          read_by_staff_at = CURRENT_TIMESTAMP,
          read_by_staff_user = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND tenant_id = $3`,
      [userId, threadId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking thread as read:", error);
    res.status(500).json({ error: "Failed to mark thread as read" });
  }
});

// GET /api/patient-messages/unread-count - Get unread message count for staff
router.get("/unread-count", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await pool.query(
      `SELECT COUNT(*) as count
      FROM patient_message_threads
      WHERE tenant_id = $1 AND is_read_by_staff = false AND status != 'closed'`,
      [tenantId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// POST /api/patient-messages/attachments - Upload attachment
router.post("/attachments", requireAuth, upload.single("file"), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const messageId = req.body.messageId;
    if (!messageId) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Message ID required" });
    }

    // Verify message exists
    const messageCheck = await pool.query(
      `SELECT m.id FROM patient_messages m
      JOIN patient_message_threads t ON m.thread_id = t.id
      WHERE m.id = $1 AND t.tenant_id = $2`,
      [messageId, tenantId]
    );

    if (messageCheck.rows.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Message not found" });
    }

    const attachmentId = crypto.randomUUID();
    const filename = `${attachmentId}${path.extname(req.file.originalname)}`;
    const filePath = path.join("uploads/message-attachments", filename);

    // Move file to final location
    fs.renameSync(req.file.path, filePath);

    // Save attachment record
    await pool.query(
      `INSERT INTO patient_message_attachments
      (id, message_id, filename, original_filename, file_size, mime_type, file_path, uploaded_by_patient)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
      [attachmentId, messageId, filename, req.file.originalname, req.file.size, req.file.mimetype, filePath]
    );

    // Update message attachment count
    await pool.query(
      `UPDATE patient_messages
      SET has_attachments = true,
          attachment_count = attachment_count + 1
      WHERE id = $1`,
      [messageId]
    );

    await auditLog(tenantId, userId, "patient_message_attachment_upload", "patient_message_attachment", attachmentId);

    res.status(201).json({
      attachmentId,
      filename: req.file.originalname,
      fileSize: req.file.size,
    });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    res.status(500).json({ error: "Failed to upload attachment" });
  }
});

// GET /api/patient-messages/attachments/:id - Download attachment
router.get("/attachments/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const attachmentId = req.params.id;

    const result = await pool.query(
      `SELECT a.*, m.thread_id
      FROM patient_message_attachments a
      JOIN patient_messages m ON a.message_id = m.id
      JOIN patient_message_threads t ON m.thread_id = t.id
      WHERE a.id = $1 AND t.tenant_id = $2`,
      [attachmentId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const attachment = result.rows[0];

    await auditLog(tenantId, userId, "patient_message_attachment_download", "patient_message_attachment", attachmentId);

    res.download(attachment.file_path, attachment.original_filename);
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

export const patientMessagesRouter = router;
