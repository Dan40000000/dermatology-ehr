import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { NextFunction, Request, Response } from "express";

const router = Router();

// Patient portal authentication middleware
interface PatientAuthRequest extends Request {
  patient?: {
    id: string;
    patientId: string;
    tenantId: string;
    email: string;
  };
}

function requirePatientAuth(req: PatientAuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = header.replace("Bearer ", "").trim();
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as any;

    // Verify this is a patient token (not staff)
    if (!decoded.patientId) {
      return res.status(403).json({ error: "Invalid patient token" });
    }

    const tenantId = req.header(env.tenantHeader);
    if (!tenantId || tenantId !== decoded.tenantId) {
      return res.status(403).json({ error: "Invalid tenant" });
    }

    req.patient = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

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
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: JPG, PNG, GIF, PDF"));
    }
  },
});

// Validation schemas
const createThreadSchema = z.object({
  subject: z.string().min(1).max(500),
  category: z.enum(["general", "prescription", "appointment", "billing", "medical", "other"]),
  messageText: z.string().min(1),
});

const sendMessageSchema = z.object({
  messageText: z.string().min(1).max(5000),
});

// GET /api/patient-portal/messages/threads - List patient's message threads
router.get("/threads", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT
        t.id,
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.last_message_at as "lastMessageAt",
        t.last_message_by as "lastMessageBy",
        t.is_read_by_patient as "isReadByPatient",
        t.created_at as "createdAt",
        (SELECT COUNT(*) FROM patient_messages WHERE thread_id = t.id AND is_internal_note = false) as "messageCount",
        (SELECT COUNT(*) FROM patient_messages WHERE thread_id = t.id AND is_internal_note = false AND sender_type = 'staff' AND read_by_patient = false) as "unreadCount",
        (SELECT message_text FROM patient_messages WHERE thread_id = t.id AND is_internal_note = false ORDER BY sent_at DESC LIMIT 1) as "lastMessagePreview"
      FROM patient_message_threads t
      WHERE t.patient_id = $1 AND t.tenant_id = $2
    `;

    const params: any[] = [patientId, tenantId];
    let paramIndex = 3;

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

    query += ` ORDER BY t.last_message_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM patient_message_threads t WHERE t.patient_id = $1 AND t.tenant_id = $2`;
    const countParams: any[] = [patientId, tenantId];
    let countParamIndex = 3;

    if (category) {
      countQuery += ` AND t.category = $${countParamIndex}`;
      countParams.push(category);
      countParamIndex++;
    }
    if (status) {
      countQuery += ` AND t.status = $${countParamIndex}`;
      countParams.push(status);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

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
    console.error("Error fetching patient threads:", error);
    res.status(500).json({ error: "Failed to fetch message threads" });
  }
});

// GET /api/patient-portal/messages/threads/:id - Get thread with messages
router.get("/threads/:id", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const threadId = req.params.id;

    // Get thread details
    const threadResult = await pool.query(
      `SELECT
        t.id,
        t.subject,
        t.category,
        t.priority,
        t.status,
        t.last_message_at as "lastMessageAt",
        t.last_message_by as "lastMessageBy",
        t.is_read_by_patient as "isReadByPatient",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt"
      FROM patient_message_threads t
      WHERE t.id = $1 AND t.patient_id = $2 AND t.tenant_id = $3`,
      [threadId, patientId, tenantId]
    );

    if (threadResult.rows.length === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const thread = threadResult.rows[0];

    // Get all non-internal messages in thread
    const messagesResult = await pool.query(
      `SELECT
        m.id,
        m.sender_type as "senderType",
        m.sender_name as "senderName",
        m.message_text as "messageText",
        m.sent_at as "sentAt",
        m.has_attachments as "hasAttachments",
        m.read_by_patient as "readByPatient",
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', a.id,
            'filename', a.original_filename,
            'fileSize', a.file_size,
            'mimeType', a.mime_type
          ))
          FROM patient_message_attachments a
          WHERE a.message_id = m.id),
          '[]'
        ) as attachments
      FROM patient_messages m
      WHERE m.thread_id = $1 AND m.is_internal_note = false
      ORDER BY m.sent_at ASC`,
      [threadId]
    );

    res.json({
      thread,
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error("Error fetching thread:", error);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

// POST /api/patient-portal/messages/threads - Create new thread
router.post("/threads", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const patientEmail = req.patient!.email;

    const parsed = createThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { subject, category, messageText } = parsed.data;

    // Get patient name for sender
    const patientResult = await pool.query(
      "SELECT first_name, last_name FROM patients WHERE id = $1",
      [patientId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const patientName = `${patientResult.rows[0].first_name} ${patientResult.rows[0].last_name}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create thread
      const threadId = crypto.randomUUID();

      // Auto-assign priority based on category
      let priority = "normal";
      if (category === "medical") {
        priority = "high";
      } else if (category === "billing" || category === "general") {
        priority = "low";
      }

      await client.query(
        `INSERT INTO patient_message_threads
        (id, tenant_id, patient_id, subject, category, priority, status, created_by_patient, last_message_by, is_read_by_staff)
        VALUES ($1, $2, $3, $4, $5, $6, 'open', true, 'patient', false)`,
        [threadId, tenantId, patientId, subject, category, priority]
      );

      // Create first message
      const messageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_messages
        (id, thread_id, sender_type, sender_patient_id, sender_name, message_text, read_by_patient)
        VALUES ($1, $2, 'patient', $3, $4, $5, true)`,
        [messageId, threadId, patientId, patientName, messageText]
      );

      // Check for auto-reply
      const autoReplyResult = await client.query(
        `SELECT auto_reply_text FROM message_auto_replies
        WHERE tenant_id = $1 AND category = $2 AND is_active = true
        LIMIT 1`,
        [tenantId, category]
      );

      if (autoReplyResult.rows.length > 0) {
        const autoReplyId = crypto.randomUUID();
        await client.query(
          `INSERT INTO patient_messages
          (id, thread_id, sender_type, sender_name, message_text, delivered_to_patient)
          VALUES ($1, $2, 'staff', 'Automated System', $3, true)`,
          [autoReplyId, threadId, autoReplyResult.rows[0].auto_reply_text]
        );

        // Update thread with auto-reply
        await client.query(
          `UPDATE patient_message_threads
          SET last_message_by = 'staff',
              last_message_at = CURRENT_TIMESTAMP,
              is_read_by_patient = false
          WHERE id = $1`,
          [threadId]
        );
      }

      await client.query("COMMIT");

      // TODO: Send notification to staff about new message

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

// POST /api/patient-portal/messages/threads/:id/messages - Send message in thread
router.post("/threads/:id/messages", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const threadId = req.params.id;

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { messageText } = parsed.data;

    // Verify thread exists and belongs to patient
    const threadCheck = await pool.query(
      "SELECT id, status FROM patient_message_threads WHERE id = $1 AND patient_id = $2 AND tenant_id = $3",
      [threadId, patientId, tenantId]
    );

    if (threadCheck.rows.length === 0) {
      return res.status(404).json({ error: "Thread not found" });
    }

    if (threadCheck.rows[0].status === "closed") {
      return res.status(400).json({ error: "Cannot send message to closed thread" });
    }

    // Get patient name
    const patientResult = await pool.query(
      "SELECT first_name, last_name FROM patients WHERE id = $1",
      [patientId]
    );
    const patientName = `${patientResult.rows[0].first_name} ${patientResult.rows[0].last_name}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create message
      const messageId = crypto.randomUUID();
      await client.query(
        `INSERT INTO patient_messages
        (id, thread_id, sender_type, sender_patient_id, sender_name, message_text, read_by_patient)
        VALUES ($1, $2, 'patient', $3, $4, $5, true)`,
        [messageId, threadId, patientId, patientName, messageText]
      );

      // Update thread
      await client.query(
        `UPDATE patient_message_threads
        SET last_message_at = CURRENT_TIMESTAMP,
            last_message_by = 'patient',
            is_read_by_staff = false,
            status = CASE WHEN status = 'waiting-patient' THEN 'in-progress' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [threadId]
      );

      await client.query("COMMIT");

      // TODO: Send notification to staff about new patient message

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

// POST /api/patient-portal/messages/threads/:id/mark-read - Mark thread as read by patient
router.post("/threads/:id/mark-read", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const threadId = req.params.id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Mark thread as read
      await client.query(
        `UPDATE patient_message_threads
        SET is_read_by_patient = true,
            read_by_patient_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND patient_id = $2 AND tenant_id = $3`,
        [threadId, patientId, tenantId]
      );

      // Mark all staff messages as read by patient
      await client.query(
        `UPDATE patient_messages
        SET read_by_patient = true,
            read_by_patient_at = CURRENT_TIMESTAMP
        WHERE thread_id = $1 AND sender_type = 'staff' AND read_by_patient = false`,
        [threadId]
      );

      await client.query("COMMIT");

      res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error marking thread as read:", error);
    res.status(500).json({ error: "Failed to mark thread as read" });
  }
});

// GET /api/patient-portal/messages/unread-count - Get unread message count
router.get("/unread-count", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    const result = await pool.query(
      `SELECT COUNT(*) as count
      FROM patient_message_threads
      WHERE patient_id = $1 AND tenant_id = $2 AND is_read_by_patient = false`,
      [patientId, tenantId]
    );

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// POST /api/patient-portal/messages/attachments - Upload attachment
router.post("/attachments", requirePatientAuth, upload.single("file"), async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const messageId = req.body.messageId;
    if (!messageId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Message ID required" });
    }

    // Verify message exists and belongs to patient's thread
    const messageCheck = await pool.query(
      `SELECT m.id FROM patient_messages m
      JOIN patient_message_threads t ON m.thread_id = t.id
      WHERE m.id = $1 AND t.patient_id = $2 AND t.tenant_id = $3`,
      [messageId, patientId, tenantId]
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
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

// GET /api/patient-portal/messages/attachments/:id - Download attachment
router.get("/attachments/:id", requirePatientAuth, async (req: PatientAuthRequest, res) => {
  try {
    const patientId = req.patient!.patientId;
    const tenantId = req.patient!.tenantId;
    const attachmentId = req.params.id;

    const result = await pool.query(
      `SELECT a.*
      FROM patient_message_attachments a
      JOIN patient_messages m ON a.message_id = m.id
      JOIN patient_message_threads t ON m.thread_id = t.id
      WHERE a.id = $1 AND t.patient_id = $2 AND t.tenant_id = $3`,
      [attachmentId, patientId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    const attachment = result.rows[0];

    res.download(attachment.file_path, attachment.original_filename);
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

export const patientPortalMessagesRouter = router;
