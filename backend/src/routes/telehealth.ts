import { Router, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import { pool } from "../db/pool";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/moduleAccess";
import crypto from "crypto";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth, requireModuleAccess("telehealth"));

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logTelehealthError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

function isMissingRelationError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
  );
}

function isDemoTenant(tenantId: string): boolean {
  return tenantId === "tenant-demo";
}

function mapDerivedTelehealthStatus(appointmentStatus: string): string {
  const normalized = String(appointmentStatus || "").toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled" || normalized === "no_show") return "cancelled";
  if (["checked_in", "in_room", "with_provider"].includes(normalized)) return "in_progress";
  return "scheduled";
}

function mapDerivedTelehealthSession(row: any) {
  const mappedStatus = mapDerivedTelehealthStatus(row.appointment_status);
  const scheduledStart = row.scheduled_start ? new Date(row.scheduled_start) : null;
  const scheduledEnd = row.scheduled_end ? new Date(row.scheduled_end) : null;
  const durationMinutes =
    scheduledStart && scheduledEnd
      ? Math.max(1, Math.round((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000))
      : null;

  return {
    id: `demo-telehealth-${row.appointment_id}`,
    tenant_id: row.tenant_id,
    appointment_id: row.appointment_id,
    patient_id: row.patient_id,
    provider_id: row.provider_id,
    scheduled_start: row.scheduled_start,
    scheduled_end: row.scheduled_end,
    session_token: `demo-session-${row.appointment_id}`,
    room_name: `demo-room-${row.appointment_id}`,
    status: mappedStatus,
    started_at: mappedStatus === "in_progress" || mappedStatus === "completed" ? row.scheduled_start : null,
    ended_at: mappedStatus === "completed" ? row.scheduled_end : null,
    duration_minutes: mappedStatus === "completed" ? durationMinutes : null,
    recording_consent: false,
    recording_consent_timestamp: null,
    patient_state: row.patient_state || "CO",
    provider_licensed_states: ["CO"],
    state_licensing_verified: true,
    virtual_background_enabled: true,
    beauty_filter_enabled: false,
    screen_sharing_enabled: true,
    connection_quality: "excellent",
    reconnection_count: 0,
    reason: row.appointment_type_name,
    assigned_to: row.provider_id,
    created_at: row.created_at || row.scheduled_start,
    updated_at: row.created_at || row.scheduled_start,
    patient_first_name: row.patient_first_name,
    patient_last_name: row.patient_last_name,
    provider_name: row.provider_name,
    assigned_to_name: row.provider_name,
    physician_name: row.provider_name,
  };
}

function getTelehealthSessionAnchor(session: any) {
  const value = session?.scheduled_start || session?.started_at || session?.created_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

async function listDerivedDemoTelehealthSessions(
  tenantId: string,
  filters: {
    providerId?: unknown;
    patientId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    reason?: unknown;
    assignedTo?: unknown;
    physicianId?: unknown;
  } = {},
) {
  let queryText = `
    SELECT
      a.id AS appointment_id,
      a.tenant_id,
      a.patient_id,
      a.provider_id,
      a.scheduled_start,
      a.scheduled_end,
      a.status AS appointment_status,
      COALESCE(a.created_at, a.scheduled_start) AS created_at,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      pr.full_name AS provider_name,
      at.name AS appointment_type_name,
      l.name AS location_name,
      'CO' AS patient_state
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN providers pr ON a.provider_id = pr.id
    LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
    LEFT JOIN locations l ON a.location_id = l.id
    WHERE a.tenant_id = $1
      AND (
        at.name ILIKE '%telehealth%'
        OR at.name ILIKE '%video%'
        OR l.name ILIKE '%virtual%'
      )
  `;
  const params: any[] = [tenantId];
  let paramCount = 1;

  if (filters.providerId) {
    queryText += ` AND a.provider_id = $${++paramCount}`;
    params.push(filters.providerId);
  }

  if (filters.patientId) {
    queryText += ` AND a.patient_id = $${++paramCount}`;
    params.push(filters.patientId);
  }

  if (filters.startDate) {
    queryText += ` AND a.scheduled_start >= $${++paramCount}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    queryText += ` AND a.scheduled_start < ($${++paramCount}::date + INTERVAL '1 day')`;
    params.push(filters.endDate);
  }

  if (filters.reason) {
    queryText += ` AND at.name ILIKE $${++paramCount}`;
    params.push(`%${filters.reason}%`);
  }

  if (filters.assignedTo) {
    queryText += ` AND a.provider_id = $${++paramCount}`;
    params.push(filters.assignedTo);
  }

  if (filters.physicianId) {
    queryText += ` AND a.provider_id = $${++paramCount}`;
    params.push(filters.physicianId);
  }

  queryText += ` ORDER BY a.scheduled_start ASC`;
  const result = await pool.query(queryText, params);
  return result.rows.map(mapDerivedTelehealthSession);
}

async function getDerivedDemoTelehealthSession(tenantId: string, id: string) {
  const match = id.match(/^demo-telehealth-(.+)$/);
  if (!match?.[1]) return null;
  const sessions = await listDerivedDemoTelehealthSessions(tenantId);
  return sessions.find((session) => session.id === id || String(session.appointment_id) === match[1]) || null;
}

// ============================================
// STATS AND ANALYTICS
// ============================================

// Get telehealth stats
router.get("/stats", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { startDate, endDate } = req.query;

  try {
    if (isDemoTenant(tenantId)) {
      const sessions = await listDerivedDemoTelehealthSessions(tenantId, { startDate, endDate });
      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const nextWeek = new Date(startOfToday);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const completedDurations = sessions
        .filter((session) => session.status === "completed" && Number(session.duration_minutes) > 0)
        .map((session) => Number(session.duration_minutes));

      return res.json({
        todayVisits: sessions.filter((session) => {
          const anchor = getTelehealthSessionAnchor(session);
          return anchor && isSameLocalDay(anchor, today) && !["cancelled", "error", "no_show"].includes(String(session.status));
        }).length,
        waitingNow: sessions.filter((session) => session.status === "waiting").length,
        liveNow: sessions.filter((session) => session.status === "in_progress").length,
        upcomingWeek: sessions.filter((session) => {
          const anchor = getTelehealthSessionAnchor(session);
          return anchor
            && anchor >= startOfToday
            && anchor < nextWeek
            && !["completed", "cancelled", "error", "no_show"].includes(String(session.status));
        }).length,
        completedToday: sessions.filter((session) => {
          const anchor = getTelehealthSessionAnchor(session);
          return anchor && session.status === "completed" && isSameLocalDay(anchor, today);
        }).length,
        cancelledThisWeek: sessions.filter((session) => {
          const anchor = getTelehealthSessionAnchor(session);
          return anchor
            && anchor >= startOfToday
            && anchor < nextWeek
            && ["cancelled", "error", "no_show"].includes(String(session.status));
        }).length,
        averageCompletedDurationMinutes: completedDurations.length > 0
          ? Math.round(completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length)
          : 0,
        uniquePatientsInRange: new Set(sessions.map((session) => String(session.patient_id || ""))).size,
        providersWithTelehealth: new Set(sessions.map((session) => String(session.provider_id || ""))).size,
      });
    }

    let dateFilter = "";
    const params: any[] = [tenantId];
    let paramCount = 1;

    if (startDate) {
      dateFilter += ` AND COALESCE(a.scheduled_start, ts.created_at) >= $${++paramCount}::date`;
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ` AND COALESCE(a.scheduled_start, ts.created_at) < ($${++paramCount}::date + INTERVAL '1 day')`;
      params.push(endDate);
    }

    const statsQuery = `
      WITH scoped AS (
        SELECT
          ts.patient_id,
          ts.provider_id,
          ts.assigned_to,
          ts.status,
          COALESCE(a.scheduled_start, ts.created_at) AS session_time,
          CASE
            WHEN ts.duration_minutes IS NOT NULL THEN ts.duration_minutes::numeric
            WHEN ts.started_at IS NOT NULL AND ts.ended_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ts.ended_at - ts.started_at)) / 60.0
            WHEN a.scheduled_start IS NOT NULL AND a.scheduled_end IS NOT NULL AND ts.status = 'completed'
              THEN EXTRACT(EPOCH FROM (a.scheduled_end - a.scheduled_start)) / 60.0
            ELSE NULL
          END AS completed_duration_minutes
        FROM telehealth_sessions ts
        LEFT JOIN appointments a ON ts.appointment_id = a.id
        WHERE ts.tenant_id = $1${dateFilter}
      )
      SELECT
        COUNT(*) FILTER (
          WHERE session_time >= CURRENT_DATE
            AND session_time < CURRENT_DATE + INTERVAL '1 day'
            AND status NOT IN ('cancelled', 'error', 'no_show')
        ) AS today_visits,
        COUNT(*) FILTER (WHERE status = 'waiting') AS waiting_now,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS live_now,
        COUNT(*) FILTER (
          WHERE session_time >= CURRENT_DATE
            AND session_time < CURRENT_DATE + INTERVAL '7 day'
            AND status NOT IN ('completed', 'cancelled', 'error', 'no_show')
        ) AS upcoming_week,
        COUNT(*) FILTER (
          WHERE session_time >= CURRENT_DATE
            AND session_time < CURRENT_DATE + INTERVAL '1 day'
            AND status = 'completed'
        ) AS completed_today,
        COUNT(*) FILTER (
          WHERE session_time >= CURRENT_DATE
            AND session_time < CURRENT_DATE + INTERVAL '7 day'
            AND status IN ('cancelled', 'error', 'no_show')
        ) AS cancelled_this_week,
        COALESCE(ROUND(AVG(completed_duration_minutes) FILTER (WHERE status = 'completed')), 0) AS average_completed_duration_minutes,
        COUNT(DISTINCT patient_id) AS unique_patients_in_range,
        COUNT(DISTINCT COALESCE(assigned_to, provider_id)) AS providers_with_telehealth
      FROM scoped
    `;

    const statsResult = await pool.query(statsQuery, params);

    res.json({
      todayVisits: parseInt(statsResult.rows[0].today_visits) || 0,
      waitingNow: parseInt(statsResult.rows[0].waiting_now) || 0,
      liveNow: parseInt(statsResult.rows[0].live_now) || 0,
      upcomingWeek: parseInt(statsResult.rows[0].upcoming_week) || 0,
      completedToday: parseInt(statsResult.rows[0].completed_today) || 0,
      cancelledThisWeek: parseInt(statsResult.rows[0].cancelled_this_week) || 0,
      averageCompletedDurationMinutes: parseInt(statsResult.rows[0].average_completed_duration_minutes) || 0,
      uniquePatientsInRange: parseInt(statsResult.rows[0].unique_patients_in_range) || 0,
      providersWithTelehealth: parseInt(statsResult.rows[0].providers_with_telehealth) || 0,
    });
  } catch (error) {
    logTelehealthError("Error fetching telehealth stats", error);
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
      logTelehealthError("Error creating telehealth session", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  }
);

// Get session details
router.get("/sessions/:id", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const id = req.params.id || "";

  try {
    if (isDemoTenant(tenantId)) {
      const derived = await getDerivedDemoTelehealthSession(tenantId, id);
      if (derived) return res.json(derived);
    }

    const result = await pool.query(
      `SELECT ts.*,
              a.scheduled_start, a.scheduled_end,
              p.first_name as patient_first_name, p.last_name as patient_last_name,
              pr.full_name as provider_name
       FROM telehealth_sessions ts
       LEFT JOIN appointments a ON ts.appointment_id = a.id
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
    logTelehealthError("Error fetching session", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// List sessions
router.get("/sessions", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { status, providerId, patientId, startDate, endDate, reason, assignedTo, physicianId, myUnreadOnly } = req.query;

  try {
    if (isDemoTenant(tenantId)) {
      let sessions = await listDerivedDemoTelehealthSessions(tenantId, {
        providerId,
        patientId,
        startDate,
        endDate,
        reason,
        assignedTo,
        physicianId,
      });
      if (status) {
        sessions = sessions.filter((session) => session.status === status);
      }
      if (myUnreadOnly === "true") {
        sessions = [];
      }
      return res.json(sessions);
    }

    let queryText = `
      SELECT ts.*,
             a.scheduled_start, a.scheduled_end,
             p.first_name as patient_first_name, p.last_name as patient_last_name,
             pr.full_name as provider_name,
             assigned.full_name as assigned_to_name,
             physician.full_name as physician_name
      FROM telehealth_sessions ts
      LEFT JOIN appointments a ON ts.appointment_id = a.id
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
      queryText += ` AND COALESCE(a.scheduled_start, ts.created_at) >= $${++paramCount}::date`;
      params.push(startDate);
    }

    if (endDate) {
      queryText += ` AND COALESCE(a.scheduled_start, ts.created_at) < ($${++paramCount}::date + INTERVAL '1 day')`;
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

    queryText += ` ORDER BY COALESCE(a.scheduled_start, ts.created_at) ASC LIMIT 100`;

    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    logTelehealthError("Error fetching sessions", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Update session status
router.patch("/sessions/:id/status", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const id = req.params.id || "";
  const { status } = req.body;

  try {
    if (isDemoTenant(tenantId) && id.startsWith("demo-telehealth-")) {
      const derived = await getDerivedDemoTelehealthSession(tenantId, id);
      if (!derived) return res.status(404).json({ error: "Session not found" });
      return res.json({
        ...derived,
        status,
        started_at: status === "in_progress" ? new Date().toISOString() : derived.started_at,
        ended_at: status === "completed" ? new Date().toISOString() : derived.ended_at,
      });
    }

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
    logTelehealthError("Error updating session status", error);
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
    logTelehealthError("Error joining waiting room", error);
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
    logTelehealthError("Error updating equipment check", error);
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
    logTelehealthError("Error adding chat message", error);
    res.status(500).json({ error: "Failed to add chat message" });
  }
});

// Get waiting room queue
router.get("/waiting-room", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;

  try {
    if (isDemoTenant(tenantId)) {
      return res.json([]);
    }

    const result = await pool.query(
      `SELECT wr.*, p.first_name, p.last_name, p.email,
              ts.provider_id, pr.full_name as provider_name
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
    if (isMissingRelationError(error)) {
      logger.warn("Telehealth waiting room table missing; returning empty demo queue", { tenantId });
      return res.json([]);
    }

    logTelehealthError("Error fetching waiting room", error);
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
    logTelehealthError("Error calling patient", error);
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
    logTelehealthError("Error saving session notes", error);
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
    logTelehealthError("Error fetching notes", error);
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
    logTelehealthError("Error finalizing notes", error);
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
    logTelehealthError("Error saving quality metrics", error);
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
    logTelehealthError("Error fetching metrics", error);
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
    logTelehealthError("Error starting recording", error);
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
    logTelehealthError("Error stopping recording", error);
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
    logTelehealthError("Error fetching recordings", error);
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
    logTelehealthError("Error capturing photo", error);
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
    logTelehealthError("Error fetching photos", error);
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
    logTelehealthError("Error adding provider license", error);
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
    logTelehealthError("Error fetching licenses", error);
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
    logTelehealthError("Error fetching educational content", error);
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
    logTelehealthError("Error tracking view", error);
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
    logTelehealthError("Error fetching events", error);
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
    logTelehealthError("Error logging event", error);
    res.status(500).json({ error: "Failed to log event" });
  }
});

export default router;
