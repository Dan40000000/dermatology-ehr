import { Router, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import crypto from "crypto";

const router = Router();
router.use(requireAuth);

// ============================================
// STATS AND ANALYTICS
// ============================================

// Get telehealth stats
router.get("/stats", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const { startDate, endDate } = req.query;

  try {
    let dateFilter = "";
    const params: any[] = [tenantId, userId];
    let paramCount = 2;

    if (startDate) {
      dateFilter += ` AND ts.created_at >= $${++paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ` AND ts.created_at <= $${++paramCount}`;
      params.push(endDate);
    }

    // Get stats for the current provider
    const statsQuery = `
      SELECT
        COUNT(CASE WHEN ts.status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN ts.status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN ts.status IN ('scheduled', 'waiting') AND ts.provider_id IS NULL THEN 1 END) as unassigned_count
      FROM telehealth_sessions ts
      WHERE ts.tenant_id = $1 AND (ts.provider_id = $2 OR ts.assigned_to = $2)${dateFilter}
    `;

    const statsResult = await pool.query(statsQuery, params);

    // Get unread messages count (placeholder - implement when messaging is added)
    const unreadCount = 0;

    res.json({
      myInProgress: parseInt(statsResult.rows[0].in_progress_count) || 0,
      myCompleted: parseInt(statsResult.rows[0].completed_count) || 0,
      myUnreadMessages: unreadCount,
      unassignedCases: parseInt(statsResult.rows[0].unassigned_count) || 0,
    });
  } catch (error) {
    console.error("Error fetching telehealth stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ============================================
// SESSION MANAGEMENT
// ============================================

// Create a new telehealth session
router.post(
  "/sessions",
  [
    body("appointmentId").optional().isInt(),
    body("patientId").isInt(),
    body("providerId").isInt(),
    body("patientState").isString().isLength({ min: 2, max: 2 }),
    body("recordingConsent").optional().isBoolean(),
    body("reason").optional().isString(),
    body("assignedTo").optional().isInt(),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const { appointmentId, patientId, providerId, patientState, recordingConsent, reason, assignedTo } = req.body;

    try {
      // Verify state licensing
      const licenseCheck = await pool.query(
        `SELECT * FROM provider_state_licenses
         WHERE tenant_id = $1 AND provider_id = $2 AND state_code = $3 AND status = 'active'`,
        [tenantId, providerId, patientState]
      );

      if (licenseCheck.rows.length === 0) {
        return res.status(403).json({
          error: "Provider not licensed in patient's state",
          patientState,
          message: `Provider must be licensed in ${patientState} to conduct telehealth visits with this patient.`,
        });
      }

      // Generate unique session token and room name
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const roomName = `derm-${tenantId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      const result = await pool.query(
        `INSERT INTO telehealth_sessions
         (tenant_id, appointment_id, patient_id, provider_id, session_token, room_name,
          patient_state, provider_licensed_states, state_licensing_verified,
          recording_consent, recording_consent_timestamp, status, reason, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, 'scheduled', $11, $12)
         RETURNING *`,
        [
          tenantId,
          appointmentId || null,
          patientId,
          providerId,
          sessionToken,
          roomName,
          patientState,
          [patientState],
          recordingConsent || false,
          recordingConsent ? new Date() : null,
          reason || null,
          assignedTo || providerId,
        ]
      );

      // Log session creation event
      await pool.query(
        `INSERT INTO telehealth_session_events
         (tenant_id, session_id, event_type, event_data, user_id, user_type)
         VALUES ($1, $2, 'session_created', $3, $4, 'provider')`,
        [tenantId, result.rows[0].id, JSON.stringify({ patientState }), providerId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error creating telehealth session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  }
);

// Get session details
router.get("/sessions/:id", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT ts.*,
              p.first_name as patient_first_name, p.last_name as patient_last_name,
              pr.name as provider_name
       FROM telehealth_sessions ts
       LEFT JOIN patients p ON ts.patient_id = p.id
       LEFT JOIN providers pr ON ts.provider_id = pr.id
       WHERE ts.tenant_id = $1 AND ts.id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// List sessions
router.get("/sessions", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { status, providerId, patientId, startDate, endDate, reason, assignedTo, physicianId, myUnreadOnly } = req.query;

  try {
    let queryText = `
      SELECT ts.*,
             p.first_name as patient_first_name, p.last_name as patient_last_name,
             pr.name as provider_name,
             assigned.name as assigned_to_name,
             physician.name as physician_name
      FROM telehealth_sessions ts
      LEFT JOIN patients p ON ts.patient_id = p.id
      LEFT JOIN providers pr ON ts.provider_id = pr.id
      LEFT JOIN providers assigned ON ts.assigned_to = assigned.id
      LEFT JOIN providers physician ON ts.provider_id = physician.id
      WHERE ts.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (status) {
      queryText += ` AND ts.status = $${++paramCount}`;
      params.push(status);
    }

    if (providerId) {
      queryText += ` AND ts.provider_id = $${++paramCount}`;
      params.push(providerId);
    }

    if (patientId) {
      queryText += ` AND ts.patient_id = $${++paramCount}`;
      params.push(patientId);
    }

    if (startDate) {
      queryText += ` AND ts.created_at >= $${++paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      queryText += ` AND ts.created_at <= $${++paramCount}`;
      params.push(endDate);
    }

    if (reason) {
      queryText += ` AND ts.reason = $${++paramCount}`;
      params.push(reason);
    }

    if (assignedTo) {
      queryText += ` AND ts.assigned_to = $${++paramCount}`;
      params.push(assignedTo);
    }

    if (physicianId) {
      queryText += ` AND ts.provider_id = $${++paramCount}`;
      params.push(physicianId);
    }

    // myUnreadOnly filter would require messaging table - placeholder for now
    if (myUnreadOnly === 'true') {
      // Add filter when messaging is implemented
    }

    queryText += ` ORDER BY ts.created_at DESC LIMIT 100`;

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Update session status
router.patch("/sessions/:id/status", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updateData: any = { status };

    if (status === "in_progress" && !req.body.startedAt) {
      updateData.startedAt = new Date();
    }

    if (status === "completed" && !req.body.endedAt) {
      updateData.endedAt = new Date();
    }

    const result = await pool.query(
      `UPDATE telehealth_sessions
       SET status = $1, started_at = COALESCE($2, started_at), ended_at = COALESCE($3, ended_at),
           duration_minutes = CASE
             WHEN $1 = 'completed' AND ended_at IS NOT NULL AND started_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (COALESCE($3, ended_at) - started_at))/60
             ELSE duration_minutes
           END
       WHERE tenant_id = $4 AND id = $5
       RETURNING *`,
      [status, updateData.startedAt, updateData.endedAt, tenantId, id]
    );

    // Log event
    await pool.query(
      `INSERT INTO telehealth_session_events
       (tenant_id, session_id, event_type, event_data, user_id, user_type)
       VALUES ($1, $2, 'status_changed', $3, $4, 'provider')`,
      [tenantId, id, JSON.stringify({ newStatus: status }), req.user?.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating session status:", error);
    res.status(500).json({ error: "Failed to update session" });
  }
});

// ============================================
// WAITING ROOM MANAGEMENT
// ============================================

// Join waiting room
router.post("/waiting-room/join", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { sessionId, patientId } = req.body;

  try {
    // Get current queue position
    const queueCount = await pool.query(
      `SELECT COUNT(*) as count FROM telehealth_waiting_room
       WHERE tenant_id = $1 AND status = 'waiting'`,
      [tenantId]
    );

    const queuePosition = parseInt(queueCount.rows[0].count) + 1;
    const estimatedWait = queuePosition * 15; // 15 minutes per patient estimate

    const result = await pool.query(
      `INSERT INTO telehealth_waiting_room
       (tenant_id, session_id, patient_id, queue_position, estimated_wait_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, sessionId, patientId, queuePosition, estimatedWait]
    );

    // Update session status to waiting
    await pool.query(
      `UPDATE telehealth_sessions SET status = 'waiting' WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error joining waiting room:", error);
    res.status(500).json({ error: "Failed to join waiting room" });
  }
});

// Update equipment check
router.patch("/waiting-room/:id/equipment-check", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { camera, microphone, speaker, bandwidth, browser } = req.body;

  try {
    const result = await pool.query(
      `UPDATE telehealth_waiting_room
       SET camera_working = $1, microphone_working = $2, speaker_working = $3,
           bandwidth_adequate = $4, browser_compatible = $5, equipment_check_completed = true
       WHERE tenant_id = $6 AND id = $7
       RETURNING *`,
      [camera, microphone, speaker, bandwidth, browser, tenantId, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating equipment check:", error);
    res.status(500).json({ error: "Failed to update equipment check" });
  }
});

// Add chat message to waiting room
router.post("/waiting-room/:id/chat", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { message, sender } = req.body;

  try {
    const result = await pool.query(
      `UPDATE telehealth_waiting_room
       SET chat_messages = chat_messages || $1::jsonb
       WHERE tenant_id = $2 AND id = $3
       RETURNING *`,
      [
        JSON.stringify({
          timestamp: new Date(),
          sender,
          message,
        }),
        tenantId,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error adding chat message:", error);
    res.status(500).json({ error: "Failed to add chat message" });
  }
});

// Get waiting room queue
router.get("/waiting-room", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;

  try {
    const result = await pool.query(
      `SELECT wr.*, p.first_name, p.last_name, p.email,
              ts.provider_id, pr.name as provider_name
       FROM telehealth_waiting_room wr
       LEFT JOIN patients p ON wr.patient_id = p.id
       LEFT JOIN telehealth_sessions ts ON wr.session_id = ts.id
       LEFT JOIN providers pr ON ts.provider_id = pr.id
       WHERE wr.tenant_id = $1 AND wr.status = 'waiting'
       ORDER BY wr.queue_position ASC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching waiting room:", error);
    res.status(500).json({ error: "Failed to fetch waiting room" });
  }
});

// Call patient from waiting room
router.post("/waiting-room/:id/call", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE telehealth_waiting_room
       SET status = 'called', called_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id]
    );

    // Update session to in_progress
    if (result.rows.length > 0) {
      await pool.query(
        `UPDATE telehealth_sessions
         SET status = 'in_progress', started_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2`,
        [result.rows[0].session_id, tenantId]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error calling patient:", error);
    res.status(500).json({ error: "Failed to call patient" });
  }
});

// ============================================
// SESSION NOTES
// ============================================

// Create or update session notes
router.post("/sessions/:id/notes", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const {
    chiefComplaint,
    hpi,
    examinationFindings,
    assessment,
    plan,
    suggestedCptCodes,
    suggestedIcd10Codes,
    complexityLevel,
  } = req.body;

  try {
    // Check if notes already exist
    const existing = await pool.query(
      `SELECT id FROM telehealth_session_notes WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing notes
      result = await pool.query(
        `UPDATE telehealth_session_notes
         SET chief_complaint = COALESCE($1, chief_complaint),
             hpi = COALESCE($2, hpi),
             examination_findings = COALESCE($3, examination_findings),
             assessment = COALESCE($4, assessment),
             plan = COALESCE($5, plan),
             suggested_cpt_codes = COALESCE($6, suggested_cpt_codes),
             suggested_icd10_codes = COALESCE($7, suggested_icd10_codes),
             complexity_level = COALESCE($8, complexity_level)
         WHERE tenant_id = $9 AND session_id = $10
         RETURNING *`,
        [
          chiefComplaint,
          hpi,
          examinationFindings,
          assessment,
          plan,
          suggestedCptCodes,
          suggestedIcd10Codes,
          complexityLevel,
          tenantId,
          id,
        ]
      );
    } else {
      // Create new notes
      result = await pool.query(
        `INSERT INTO telehealth_session_notes
         (tenant_id, session_id, chief_complaint, hpi, examination_findings, assessment, plan,
          suggested_cpt_codes, suggested_icd10_codes, complexity_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          tenantId,
          id,
          chiefComplaint,
          hpi,
          examinationFindings,
          assessment,
          plan,
          suggestedCptCodes,
          suggestedIcd10Codes,
          complexityLevel,
        ]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error saving session notes:", error);
    res.status(500).json({ error: "Failed to save notes" });
  }
});

// Get session notes
router.get("/sessions/:id/notes", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM telehealth_session_notes WHERE tenant_id = $1 AND session_id = $2`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notes not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// Finalize session notes
router.post("/sessions/:id/notes/finalize", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const providerId = req.user?.id;

  try {
    const result = await pool.query(
      `UPDATE telehealth_session_notes
       SET finalized = true, finalized_at = CURRENT_TIMESTAMP, finalized_by = $1
       WHERE tenant_id = $2 AND session_id = $3
       RETURNING *`,
      [providerId, tenantId, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error finalizing notes:", error);
    res.status(500).json({ error: "Failed to finalize notes" });
  }
});

// ============================================
// QUALITY METRICS
// ============================================

// Report quality metrics
router.post("/sessions/:id/metrics", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const {
    participantType,
    bitrateKbps,
    packetLossPercent,
    jitterMs,
    latencyMs,
    videoResolution,
    videoFps,
    audioQuality,
    connectionType,
    bandwidthUpMbps,
    bandwidthDownMbps,
    freezesCount,
    audioDropsCount,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO telehealth_quality_metrics
       (tenant_id, session_id, participant_type, bitrate_kbps, packet_loss_percent,
        jitter_ms, latency_ms, video_resolution, video_fps, audio_quality,
        connection_type, bandwidth_up_mbps, bandwidth_down_mbps, freezes_count, audio_drops_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        tenantId,
        id,
        participantType,
        bitrateKbps,
        packetLossPercent,
        jitterMs,
        latencyMs,
        videoResolution,
        videoFps,
        audioQuality,
        connectionType,
        bandwidthUpMbps,
        bandwidthDownMbps,
        freezesCount || 0,
        audioDropsCount || 0,
      ]
    );

    // Update session connection quality based on latest metrics
    let quality = "excellent";
    if (packetLossPercent > 5 || latencyMs > 300) {
      quality = "poor";
    } else if (packetLossPercent > 2 || latencyMs > 150) {
      quality = "fair";
    } else if (packetLossPercent > 1 || latencyMs > 100) {
      quality = "good";
    }

    await pool.query(
      `UPDATE telehealth_sessions SET connection_quality = $1 WHERE id = $2 AND tenant_id = $3`,
      [quality, id, tenantId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error saving quality metrics:", error);
    res.status(500).json({ error: "Failed to save metrics" });
  }
});

// Get session metrics
router.get("/sessions/:id/metrics", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM telehealth_quality_metrics
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY recorded_at DESC
       LIMIT 100`,
      [tenantId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// ============================================
// RECORDINGS
// ============================================

// Start recording
router.post("/sessions/:id/recordings/start", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    // Verify consent
    const session = await pool.query(
      `SELECT recording_consent FROM telehealth_sessions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (session.rows.length === 0 || !session.rows[0].recording_consent) {
      return res.status(403).json({ error: "Recording consent not obtained" });
    }

    // Create recording record
    const filePath = `recordings/${tenantId}/${id}/${Date.now()}.mp4`;
    const result = await pool.query(
      `INSERT INTO telehealth_recordings
       (tenant_id, session_id, file_path, consent_verified, auto_delete_date)
       VALUES ($1, $2, $3, true, CURRENT_DATE + INTERVAL '7 years')
       RETURNING *`,
      [tenantId, id, filePath]
    );

    // Log event
    await pool.query(
      `INSERT INTO telehealth_session_events
       (tenant_id, session_id, event_type, event_data, user_id, user_type)
       VALUES ($1, $2, 'recording_started', $3, $4, 'provider')`,
      [tenantId, id, JSON.stringify({ recordingId: result.rows[0].id }), req.user?.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error starting recording:", error);
    res.status(500).json({ error: "Failed to start recording" });
  }
});

// Stop recording
router.post("/recordings/:id/stop", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { durationSeconds, fileSizeBytes, resolution } = req.body;

  try {
    const result = await pool.query(
      `UPDATE telehealth_recordings
       SET status = 'available', duration_seconds = $1, file_size_bytes = $2, resolution = $3
       WHERE tenant_id = $4 AND id = $5
       RETURNING *`,
      [durationSeconds, fileSizeBytes, resolution, tenantId, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error stopping recording:", error);
    res.status(500).json({ error: "Failed to stop recording" });
  }
});

// List session recordings
router.get("/sessions/:id/recordings", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM telehealth_recordings
       WHERE tenant_id = $1 AND session_id = $2 AND status != 'deleted'
       ORDER BY created_at DESC`,
      [tenantId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching recordings:", error);
    res.status(500).json({ error: "Failed to fetch recordings" });
  }
});

// ============================================
// SESSION PHOTOS
// ============================================

// Capture photo during session
router.post("/sessions/:id/photos", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { filePath, bodySite, viewType, annotationData } = req.body;

  try {
    const session = await pool.query(
      `SELECT patient_id FROM telehealth_sessions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await pool.query(
      `INSERT INTO telehealth_session_photos
       (tenant_id, session_id, patient_id, file_path, body_site, view_type,
        has_annotations, annotation_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        id,
        session.rows[0].patient_id,
        filePath,
        bodySite,
        viewType,
        !!annotationData,
        annotationData || null,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error capturing photo:", error);
    res.status(500).json({ error: "Failed to capture photo" });
  }
});

// Get session photos
router.get("/sessions/:id/photos", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM telehealth_session_photos
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY captured_at DESC`,
      [tenantId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ error: "Failed to fetch photos" });
  }
});

// ============================================
// PROVIDER LICENSING
// ============================================

// Add provider license
router.post("/provider-licenses", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const {
    providerId,
    stateCode,
    licenseNumber,
    licenseType,
    issueDate,
    expirationDate,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO provider_state_licenses
       (tenant_id, provider_id, state_code, license_number, license_type,
        issue_date, expiration_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, provider_id, state_code)
       DO UPDATE SET
         license_number = EXCLUDED.license_number,
         license_type = EXCLUDED.license_type,
         issue_date = EXCLUDED.issue_date,
         expiration_date = EXCLUDED.expiration_date
       RETURNING *`,
      [tenantId, providerId, stateCode, licenseNumber, licenseType, issueDate, expirationDate]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error adding provider license:", error);
    res.status(500).json({ error: "Failed to add license" });
  }
});

// Get provider licenses
router.get("/providers/:id/licenses", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM provider_state_licenses
       WHERE tenant_id = $1 AND provider_id = $2
       ORDER BY state_code ASC`,
      [tenantId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching licenses:", error);
    res.status(500).json({ error: "Failed to fetch licenses" });
  }
});

// ============================================
// EDUCATIONAL CONTENT
// ============================================

// Get educational content for waiting room
router.get("/educational-content", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { category } = req.query;

  try {
    let queryText = `SELECT * FROM telehealth_educational_content WHERE tenant_id = $1 AND active = true`;
    const params: any[] = [tenantId];

    if (category) {
      queryText += ` AND $2 = ANY(categories)`;
      params.push(category);
    }

    queryText += ` ORDER BY view_count DESC LIMIT 10`;

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching educational content:", error);
    res.status(500).json({ error: "Failed to fetch content" });
  }
});

// Track content view
router.post("/educational-content/:id/view", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE telehealth_educational_content
       SET view_count = view_count + 1
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking view:", error);
    res.status(500).json({ error: "Failed to track view" });
  }
});

// ============================================
// SESSION EVENTS (Audit Trail)
// ============================================

// Get session events
router.get("/sessions/:id/events", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM telehealth_session_events
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [tenantId, id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// Log custom event
router.post("/sessions/:id/events", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { eventType, eventData } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO telehealth_session_events
       (tenant_id, session_id, event_type, event_data, user_id, user_type, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        id,
        eventType,
        eventData,
        req.user?.id,
        req.user?.role,
        req.ip,
        req.get("user-agent"),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error logging event:", error);
    res.status(500).json({ error: "Failed to log event" });
  }
});

export default router;
