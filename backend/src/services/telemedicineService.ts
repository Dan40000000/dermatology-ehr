import { pool } from "../db/pool";
import crypto from "crypto";

// Types for the telemedicine service
export interface VideoSession {
  id: number;
  tenant_id: string;
  appointment_id?: number;
  patient_id: number;
  provider_id: number;
  scheduled_start: string;
  actual_start?: string;
  actual_end?: string;
  status: "scheduled" | "waiting" | "in_progress" | "completed" | "no_show" | "cancelled";
  room_url?: string;
  room_token?: string;
  recording_url?: string;
  recording_enabled: boolean;
  video_provider: "mock" | "twilio" | "daily" | "zoom";
  video_room_id?: string;
  duration_minutes?: number;
  connection_quality?: string;
  technical_issues_count: number;
  created_at: string;
  updated_at: string;
}

export interface VideoSessionWithDetails extends VideoSession {
  patient_first_name?: string;
  patient_last_name?: string;
  patient_email?: string;
  provider_name?: string;
  appointment_type_name?: string;
}

export interface VideoVisitSettings {
  id: number;
  tenant_id: string;
  provider_id: number;
  virtual_background_url?: string;
  virtual_background_type: "none" | "blur" | "image" | "clinic";
  waiting_room_enabled: boolean;
  auto_record: boolean;
  max_duration_minutes: number;
  auto_end_warning_minutes: number;
  screen_share_enabled: boolean;
  photo_capture_enabled: boolean;
  multi_participant_enabled: boolean;
  max_participants: number;
}

export interface VideoVisitNote {
  id: number;
  tenant_id: string;
  session_id: number;
  encounter_id?: number;
  tech_issues_noted?: string;
  patient_location_state?: string;
  patient_location_verified: boolean;
  consent_verified: boolean;
  consent_method?: string;
  interpreter_used: boolean;
  interpreter_language?: string;
  family_member_present: boolean;
  family_member_names?: string;
  photo_captured_count: number;
  screen_shared: boolean;
  clinical_notes?: string;
  follow_up_required: boolean;
  follow_up_type?: string;
}

export interface TelehealthConsent {
  id: number;
  tenant_id: string;
  patient_id: number;
  consent_date: string;
  consent_type: "general_telehealth" | "recording" | "photo_capture" | "screen_share" | "multi_participant";
  consent_given: boolean;
  ip_address?: string;
  user_agent?: string;
  consent_method?: string;
}

export interface VideoParticipant {
  id: number;
  session_id: number;
  participant_type: "patient" | "provider" | "interpreter" | "family" | "caregiver" | "specialist";
  participant_id?: number;
  participant_name?: string;
  participant_email?: string;
  join_token?: string;
  joined_at?: string;
  left_at?: string;
}

export interface WaitingQueueEntry {
  id: number;
  session_id: number;
  patient_id: number;
  provider_id: number;
  queue_position: number;
  joined_queue_at: string;
  estimated_wait_minutes?: number;
  device_check_completed: boolean;
  camera_working?: boolean;
  microphone_working?: boolean;
  speaker_working?: boolean;
  bandwidth_check_passed?: boolean;
  browser_supported?: boolean;
  status: "waiting" | "ready" | "called" | "joined" | "left" | "no_show";
  patient_first_name?: string;
  patient_last_name?: string;
}

// Mock Video SDK interface (for Twilio/Daily.co integration)
interface VideoRoomConfig {
  roomName: string;
  maxParticipants: number;
  enableRecording: boolean;
  enableWaitingRoom: boolean;
}

interface VideoRoomResponse {
  roomUrl: string;
  roomId: string;
  hostToken: string;
  participantTokens: Map<string, string>;
}

/**
 * Mock video provider - simulates Twilio Video or Daily.co API
 */
class MockVideoProvider {
  async createRoom(config: VideoRoomConfig): Promise<VideoRoomResponse> {
    const roomId = `room_${crypto.randomBytes(8).toString("hex")}`;
    const hostToken = `host_${crypto.randomBytes(16).toString("hex")}`;

    return {
      roomUrl: `https://video.dermapp.local/rooms/${roomId}`,
      roomId,
      hostToken,
      participantTokens: new Map(),
    };
  }

  async generateParticipantToken(roomId: string, participantType: string, participantId: string): Promise<string> {
    return `${participantType}_${participantId}_${crypto.randomBytes(12).toString("hex")}`;
  }

  async endRoom(roomId: string): Promise<boolean> {
    // In production, this would call Twilio/Daily.co API to end the room
    return true;
  }

  async getRecordingUrl(roomId: string): Promise<string | null> {
    // In production, this would return the actual recording URL
    return `https://recordings.dermapp.local/${roomId}/recording.mp4`;
  }
}

const videoProvider = new MockVideoProvider();

/**
 * Create a new video session for an appointment
 */
export async function createVideoSession(
  tenantId: string,
  appointmentId: number,
  options?: {
    enableRecording?: boolean;
    enableWaitingRoom?: boolean;
    maxParticipants?: number;
  }
): Promise<VideoSessionWithDetails> {
  // Get appointment details
  const appointmentResult = await pool.query(
    `SELECT a.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
            p.email as patient_email, pr.name as provider_name, at.name as appointment_type_name
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     LEFT JOIN providers pr ON a.provider_id = pr.id
     LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [appointmentId, tenantId]
  );

  if (appointmentResult.rows.length === 0) {
    throw new Error("Appointment not found");
  }

  const appointment = appointmentResult.rows[0];

  // Get provider settings
  const settingsResult = await pool.query(
    `SELECT * FROM video_visit_settings WHERE tenant_id = $1 AND provider_id = $2`,
    [tenantId, appointment.provider_id]
  );

  const settings = settingsResult.rows[0] || {
    waiting_room_enabled: true,
    auto_record: false,
    max_participants: 4,
  };

  // Create video room
  const roomConfig: VideoRoomConfig = {
    roomName: `derm_${tenantId}_${appointmentId}_${Date.now()}`,
    maxParticipants: options?.maxParticipants || settings.max_participants || 4,
    enableRecording: options?.enableRecording ?? settings.auto_record ?? false,
    enableWaitingRoom: options?.enableWaitingRoom ?? settings.waiting_room_enabled ?? true,
  };

  const roomResponse = await videoProvider.createRoom(roomConfig);

  // Insert video session
  const result = await pool.query(
    `INSERT INTO video_visit_sessions
     (tenant_id, appointment_id, patient_id, provider_id, scheduled_start,
      status, room_url, room_token, recording_enabled, video_provider, video_room_id)
     VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, $8, 'mock', $9)
     RETURNING *`,
    [
      tenantId,
      appointmentId,
      appointment.patient_id,
      appointment.provider_id,
      appointment.scheduled_start,
      roomResponse.roomUrl,
      roomResponse.hostToken,
      roomConfig.enableRecording,
      roomResponse.roomId,
    ]
  );

  const session = result.rows[0] as VideoSession;

  // Create initial participants
  await pool.query(
    `INSERT INTO video_visit_participants
     (tenant_id, session_id, participant_type, participant_id, participant_name, join_token)
     VALUES ($1, $2, 'provider', $3, $4, $5)`,
    [tenantId, session.id, appointment.provider_id, appointment.provider_name, roomResponse.hostToken]
  );

  const patientToken = await videoProvider.generateParticipantToken(
    roomResponse.roomId,
    "patient",
    appointment.patient_id.toString()
  );

  await pool.query(
    `INSERT INTO video_visit_participants
     (tenant_id, session_id, participant_type, participant_id, participant_name, participant_email, join_token)
     VALUES ($1, $2, 'patient', $3, $4, $5, $6)`,
    [
      tenantId,
      session.id,
      appointment.patient_id,
      `${appointment.patient_first_name} ${appointment.patient_last_name}`,
      appointment.patient_email,
      patientToken,
    ]
  );

  return {
    ...session,
    patient_first_name: appointment.patient_first_name,
    patient_last_name: appointment.patient_last_name,
    patient_email: appointment.patient_email,
    provider_name: appointment.provider_name,
    appointment_type_name: appointment.appointment_type_name,
  };
}

/**
 * Get join URL and token for a session participant
 */
export async function joinSession(
  tenantId: string,
  sessionId: number,
  participantType: "patient" | "provider" | "interpreter" | "family" | "caregiver" | "specialist",
  participantId?: number,
  participantInfo?: { name?: string; email?: string }
): Promise<{ roomUrl: string; token: string; sessionDetails: VideoSessionWithDetails }> {
  // Get session with details
  const sessionResult = await pool.query(
    `SELECT vs.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
            p.email as patient_email, pr.name as provider_name
     FROM video_visit_sessions vs
     LEFT JOIN patients p ON vs.patient_id = p.id
     LEFT JOIN providers pr ON vs.provider_id = pr.id
     WHERE vs.id = $1 AND vs.tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found");
  }

  const session = sessionResult.rows[0] as VideoSessionWithDetails;

  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error("Session is no longer active");
  }

  // Check for existing participant
  let participantResult = await pool.query(
    `SELECT * FROM video_visit_participants
     WHERE session_id = $1 AND tenant_id = $2
     AND (participant_id = $3 OR (participant_type = $4 AND participant_id IS NULL))`,
    [sessionId, tenantId, participantId, participantType]
  );

  let token: string;

  if (participantResult.rows.length > 0) {
    token = participantResult.rows[0].join_token;

    // Update join time
    await pool.query(
      `UPDATE video_visit_participants SET joined_at = NOW() WHERE id = $1`,
      [participantResult.rows[0].id]
    );
  } else {
    // Generate new token for additional participant
    token = await videoProvider.generateParticipantToken(
      session.video_room_id || "",
      participantType,
      participantId?.toString() || crypto.randomBytes(4).toString("hex")
    );

    await pool.query(
      `INSERT INTO video_visit_participants
       (tenant_id, session_id, participant_type, participant_id, participant_name, participant_email, join_token, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        tenantId,
        sessionId,
        participantType,
        participantId,
        participantInfo?.name,
        participantInfo?.email,
        token,
      ]
    );
  }

  return {
    roomUrl: session.room_url || "",
    token,
    sessionDetails: session,
  };
}

/**
 * Provider starts the video visit
 */
export async function startSession(
  tenantId: string,
  sessionId: number,
  providerId: number
): Promise<VideoSession> {
  // Verify provider owns this session
  const verifyResult = await pool.query(
    `SELECT * FROM video_visit_sessions WHERE id = $1 AND tenant_id = $2 AND provider_id = $3`,
    [sessionId, tenantId, providerId]
  );

  if (verifyResult.rows.length === 0) {
    throw new Error("Session not found or unauthorized");
  }

  const session = verifyResult.rows[0];

  if (session.status === "in_progress") {
    return session;
  }

  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error("Cannot start a completed or cancelled session");
  }

  // Update session to in_progress
  const result = await pool.query(
    `UPDATE video_visit_sessions
     SET status = 'in_progress', actual_start = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [sessionId, tenantId]
  );

  // Update waiting queue if patient is there
  await pool.query(
    `UPDATE video_visit_waiting_queue
     SET status = 'joined', called_at = NOW()
     WHERE session_id = $1 AND tenant_id = $2 AND status IN ('waiting', 'ready', 'called')`,
    [sessionId, tenantId]
  );

  return result.rows[0];
}

/**
 * End a video visit session
 */
export async function endSession(
  tenantId: string,
  sessionId: number
): Promise<VideoSession> {
  const sessionResult = await pool.query(
    `SELECT * FROM video_visit_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found");
  }

  const session = sessionResult.rows[0];

  // Calculate duration
  let durationMinutes: number | null = null;
  if (session.actual_start) {
    const startTime = new Date(session.actual_start);
    const endTime = new Date();
    durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  }

  // End the video room
  if (session.video_room_id) {
    await videoProvider.endRoom(session.video_room_id);
  }

  // Get recording URL if recording was enabled
  let recordingUrl: string | null = null;
  if (session.recording_enabled && session.video_room_id) {
    recordingUrl = await videoProvider.getRecordingUrl(session.video_room_id);
  }

  // Update session
  const result = await pool.query(
    `UPDATE video_visit_sessions
     SET status = 'completed', actual_end = NOW(), duration_minutes = $1, recording_url = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [durationMinutes, recordingUrl, sessionId, tenantId]
  );

  // Update all participants as left
  await pool.query(
    `UPDATE video_visit_participants
     SET left_at = NOW()
     WHERE session_id = $1 AND tenant_id = $2 AND left_at IS NULL`,
    [sessionId, tenantId]
  );

  // Update waiting queue
  await pool.query(
    `UPDATE video_visit_waiting_queue
     SET status = 'joined'
     WHERE session_id = $1 AND tenant_id = $2 AND status IN ('waiting', 'ready', 'called')`,
    [sessionId, tenantId]
  );

  return result.rows[0];
}

/**
 * Capture a photo during the video visit
 */
export async function capturePhoto(
  tenantId: string,
  sessionId: number,
  photoData: {
    filePath: string;
    fileSizeBytes?: number;
    bodySite?: string;
    description?: string;
    annotations?: object;
  },
  capturedByProviderId: number
): Promise<{ id: number; filePath: string; capturedAt: string }> {
  // Get session to verify and get patient_id
  const sessionResult = await pool.query(
    `SELECT patient_id FROM video_visit_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found");
  }

  const patientId = sessionResult.rows[0].patient_id;

  // Insert photo record
  const result = await pool.query(
    `INSERT INTO video_visit_photos
     (tenant_id, session_id, patient_id, file_path, file_size_bytes,
      captured_by_provider_id, body_site, description, annotations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, file_path, captured_at`,
    [
      tenantId,
      sessionId,
      patientId,
      photoData.filePath,
      photoData.fileSizeBytes,
      capturedByProviderId,
      photoData.bodySite,
      photoData.description,
      photoData.annotations ? JSON.stringify(photoData.annotations) : null,
    ]
  );

  // Update photo count in notes
  await pool.query(
    `UPDATE video_visit_notes
     SET photo_captured_count = photo_captured_count + 1
     WHERE session_id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  return {
    id: result.rows[0].id,
    filePath: result.rows[0].file_path,
    capturedAt: result.rows[0].captured_at,
  };
}

/**
 * Get provider's waiting room queue
 */
export async function getWaitingRoom(
  tenantId: string,
  providerId: number
): Promise<WaitingQueueEntry[]> {
  const result = await pool.query(
    `SELECT wq.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
            vs.scheduled_start, vs.appointment_id
     FROM video_visit_waiting_queue wq
     JOIN video_visit_sessions vs ON wq.session_id = vs.id
     JOIN patients p ON wq.patient_id = p.id
     WHERE wq.tenant_id = $1 AND wq.provider_id = $2
     AND wq.status IN ('waiting', 'ready', 'called')
     ORDER BY wq.queue_position ASC`,
    [tenantId, providerId]
  );

  return result.rows;
}

/**
 * Add patient to waiting room
 */
export async function addToWaitingRoom(
  tenantId: string,
  sessionId: number
): Promise<WaitingQueueEntry> {
  // Get session details
  const sessionResult = await pool.query(
    `SELECT * FROM video_visit_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found");
  }

  const session = sessionResult.rows[0];

  // Get current queue position
  const queueResult = await pool.query(
    `SELECT MAX(queue_position) as max_pos FROM video_visit_waiting_queue
     WHERE tenant_id = $1 AND provider_id = $2 AND status IN ('waiting', 'ready', 'called')`,
    [tenantId, session.provider_id]
  );

  const queuePosition = (queueResult.rows[0].max_pos || 0) + 1;

  // Estimate wait time (15 minutes per patient in queue)
  const estimatedWait = queuePosition * 15;

  // Insert into waiting queue
  const result = await pool.query(
    `INSERT INTO video_visit_waiting_queue
     (tenant_id, session_id, patient_id, provider_id, queue_position, estimated_wait_minutes, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'waiting')
     RETURNING *`,
    [tenantId, sessionId, session.patient_id, session.provider_id, queuePosition, estimatedWait]
  );

  // Update session status
  await pool.query(
    `UPDATE video_visit_sessions SET status = 'waiting' WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  return result.rows[0];
}

/**
 * Update device check status for waiting patient
 */
export async function updateDeviceCheck(
  tenantId: string,
  queueId: number,
  deviceStatus: {
    camera?: boolean;
    microphone?: boolean;
    speaker?: boolean;
    bandwidth?: boolean;
    browser?: boolean;
  }
): Promise<WaitingQueueEntry> {
  const allChecked = deviceStatus.camera && deviceStatus.microphone &&
                     deviceStatus.speaker && deviceStatus.bandwidth && deviceStatus.browser;

  const result = await pool.query(
    `UPDATE video_visit_waiting_queue
     SET camera_working = COALESCE($1, camera_working),
         microphone_working = COALESCE($2, microphone_working),
         speaker_working = COALESCE($3, speaker_working),
         bandwidth_check_passed = COALESCE($4, bandwidth_check_passed),
         browser_supported = COALESCE($5, browser_supported),
         device_check_completed = $6,
         status = CASE WHEN $6 = true THEN 'ready' ELSE status END
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [
      deviceStatus.camera,
      deviceStatus.microphone,
      deviceStatus.speaker,
      deviceStatus.bandwidth,
      deviceStatus.browser,
      allChecked,
      queueId,
      tenantId,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error("Queue entry not found");
  }

  return result.rows[0];
}

/**
 * Call next patient from waiting room
 */
export async function callNextPatient(
  tenantId: string,
  providerId: number
): Promise<WaitingQueueEntry | null> {
  // Get the next patient in queue
  const result = await pool.query(
    `UPDATE video_visit_waiting_queue
     SET status = 'called', called_at = NOW()
     WHERE id = (
       SELECT id FROM video_visit_waiting_queue
       WHERE tenant_id = $1 AND provider_id = $2 AND status IN ('waiting', 'ready')
       ORDER BY queue_position ASC
       LIMIT 1
     )
     RETURNING *`,
    [tenantId, providerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Add additional participant (interpreter, family member, etc.)
 */
export async function addParticipant(
  tenantId: string,
  sessionId: number,
  participantData: {
    type: "interpreter" | "family" | "caregiver" | "specialist";
    name: string;
    email?: string;
    language?: string;
  }
): Promise<VideoParticipant & { joinUrl: string }> {
  // Get session
  const sessionResult = await pool.query(
    `SELECT * FROM video_visit_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (sessionResult.rows.length === 0) {
    throw new Error("Session not found");
  }

  const session = sessionResult.rows[0];

  // Check max participants
  const participantCount = await pool.query(
    `SELECT COUNT(*) as count FROM video_visit_participants
     WHERE session_id = $1 AND tenant_id = $2 AND left_at IS NULL`,
    [sessionId, tenantId]
  );

  const settingsResult = await pool.query(
    `SELECT max_participants FROM video_visit_settings WHERE provider_id = $1 AND tenant_id = $2`,
    [session.provider_id, tenantId]
  );

  const maxParticipants = settingsResult.rows[0]?.max_participants || 4;

  if (parseInt(participantCount.rows[0].count) >= maxParticipants) {
    throw new Error(`Maximum participants (${maxParticipants}) reached`);
  }

  // Generate token
  const token = await videoProvider.generateParticipantToken(
    session.video_room_id || "",
    participantData.type,
    crypto.randomBytes(4).toString("hex")
  );

  // Insert participant
  const result = await pool.query(
    `INSERT INTO video_visit_participants
     (tenant_id, session_id, participant_type, participant_name, participant_email, join_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, sessionId, participantData.type, participantData.name, participantData.email, token]
  );

  // If interpreter, update notes
  if (participantData.type === "interpreter") {
    await pool.query(
      `UPDATE video_visit_notes
       SET interpreter_used = true, interpreter_language = $1
       WHERE session_id = $2 AND tenant_id = $3`,
      [participantData.language, sessionId, tenantId]
    );
  }

  // If family member, update notes
  if (participantData.type === "family") {
    await pool.query(
      `UPDATE video_visit_notes
       SET family_member_present = true,
           family_member_names = COALESCE(family_member_names || ', ', '') || $1
       WHERE session_id = $2 AND tenant_id = $3`,
      [participantData.name, sessionId, tenantId]
    );
  }

  return {
    ...result.rows[0],
    joinUrl: `${session.room_url}?token=${token}`,
  };
}

/**
 * Record telehealth consent
 */
export async function recordConsent(
  tenantId: string,
  patientId: number,
  consentData: {
    consentType: "general_telehealth" | "recording" | "photo_capture" | "screen_share" | "multi_participant";
    consentGiven: boolean;
    ipAddress?: string;
    userAgent?: string;
    consentMethod?: string;
  }
): Promise<TelehealthConsent> {
  const result = await pool.query(
    `INSERT INTO telehealth_consents
     (tenant_id, patient_id, consent_type, consent_given, ip_address, user_agent, consent_method)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      tenantId,
      patientId,
      consentData.consentType,
      consentData.consentGiven,
      consentData.ipAddress,
      consentData.userAgent,
      consentData.consentMethod,
    ]
  );

  return result.rows[0];
}

/**
 * Check if patient has valid consent
 */
export async function checkConsent(
  tenantId: string,
  patientId: number,
  consentType: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT * FROM telehealth_consents
     WHERE tenant_id = $1 AND patient_id = $2 AND consent_type = $3
     AND consent_given = true AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY consent_date DESC
     LIMIT 1`,
    [tenantId, patientId, consentType]
  );

  return result.rows.length > 0;
}

/**
 * Get or create video visit notes for a session
 */
export async function getOrCreateSessionNotes(
  tenantId: string,
  sessionId: number
): Promise<VideoVisitNote> {
  let result = await pool.query(
    `SELECT * FROM video_visit_notes WHERE session_id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO video_visit_notes (tenant_id, session_id) VALUES ($1, $2) RETURNING *`,
      [tenantId, sessionId]
    );
  }

  return result.rows[0];
}

/**
 * Update video visit notes
 */
export async function updateSessionNotes(
  tenantId: string,
  sessionId: number,
  updates: Partial<VideoVisitNote>
): Promise<VideoVisitNote> {
  // Ensure notes exist
  await getOrCreateSessionNotes(tenantId, sessionId);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramCount = 0;

  const updateFields: (keyof VideoVisitNote)[] = [
    "encounter_id",
    "tech_issues_noted",
    "patient_location_state",
    "patient_location_verified",
    "consent_verified",
    "consent_method",
    "interpreter_used",
    "interpreter_language",
    "family_member_present",
    "family_member_names",
    "screen_shared",
    "clinical_notes",
    "follow_up_required",
    "follow_up_type",
  ];

  for (const field of updateFields) {
    if (updates[field] !== undefined) {
      paramCount++;
      setClauses.push(`${field} = $${paramCount}`);
      values.push(updates[field]);
    }
  }

  if (setClauses.length === 0) {
    return (await pool.query(
      `SELECT * FROM video_visit_notes WHERE session_id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    )).rows[0];
  }

  values.push(sessionId, tenantId);

  const result = await pool.query(
    `UPDATE video_visit_notes
     SET ${setClauses.join(", ")}
     WHERE session_id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
     RETURNING *`,
    values
  );

  return result.rows[0];
}

/**
 * Get session with all details
 */
export async function getSessionDetails(
  tenantId: string,
  sessionId: number
): Promise<VideoSessionWithDetails | null> {
  const result = await pool.query(
    `SELECT vs.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
            p.email as patient_email, pr.name as provider_name,
            at.name as appointment_type_name
     FROM video_visit_sessions vs
     LEFT JOIN patients p ON vs.patient_id = p.id
     LEFT JOIN providers pr ON vs.provider_id = pr.id
     LEFT JOIN appointments a ON vs.appointment_id = a.id
     LEFT JOIN appointment_types at ON a.appointment_type_id = at.id
     WHERE vs.id = $1 AND vs.tenant_id = $2`,
    [sessionId, tenantId]
  );

  return result.rows[0] || null;
}

/**
 * Get all sessions for a provider with optional filters
 */
export async function getProviderSessions(
  tenantId: string,
  providerId: number,
  filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<VideoSessionWithDetails[]> {
  let query = `
    SELECT vs.*, p.first_name as patient_first_name, p.last_name as patient_last_name,
           p.email as patient_email, pr.name as provider_name
    FROM video_visit_sessions vs
    LEFT JOIN patients p ON vs.patient_id = p.id
    LEFT JOIN providers pr ON vs.provider_id = pr.id
    WHERE vs.tenant_id = $1 AND vs.provider_id = $2
  `;

  const params: unknown[] = [tenantId, providerId];
  let paramCount = 2;

  if (filters?.status) {
    paramCount++;
    query += ` AND vs.status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters?.startDate) {
    paramCount++;
    query += ` AND vs.scheduled_start >= $${paramCount}`;
    params.push(filters.startDate);
  }

  if (filters?.endDate) {
    paramCount++;
    query += ` AND vs.scheduled_start <= $${paramCount}`;
    params.push(filters.endDate);
  }

  query += ` ORDER BY vs.scheduled_start DESC`;

  if (filters?.limit) {
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get or update provider video visit settings
 */
export async function getProviderSettings(
  tenantId: string,
  providerId: number
): Promise<VideoVisitSettings> {
  let result = await pool.query(
    `SELECT * FROM video_visit_settings WHERE tenant_id = $1 AND provider_id = $2`,
    [tenantId, providerId]
  );

  if (result.rows.length === 0) {
    // Create default settings
    result = await pool.query(
      `INSERT INTO video_visit_settings
       (tenant_id, provider_id, waiting_room_enabled, auto_record, max_duration_minutes,
        screen_share_enabled, photo_capture_enabled, multi_participant_enabled, max_participants)
       VALUES ($1, $2, true, false, 60, true, true, true, 4)
       RETURNING *`,
      [tenantId, providerId]
    );
  }

  return result.rows[0];
}

/**
 * Update provider video visit settings
 */
export async function updateProviderSettings(
  tenantId: string,
  providerId: number,
  settings: Partial<VideoVisitSettings>
): Promise<VideoVisitSettings> {
  // Ensure settings exist
  await getProviderSettings(tenantId, providerId);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramCount = 0;

  const updateFields: (keyof VideoVisitSettings)[] = [
    "virtual_background_url",
    "virtual_background_type",
    "waiting_room_enabled",
    "auto_record",
    "max_duration_minutes",
    "auto_end_warning_minutes",
    "screen_share_enabled",
    "photo_capture_enabled",
    "multi_participant_enabled",
    "max_participants",
  ];

  for (const field of updateFields) {
    if (settings[field] !== undefined) {
      paramCount++;
      setClauses.push(`${field} = $${paramCount}`);
      values.push(settings[field]);
    }
  }

  if (setClauses.length === 0) {
    return (await pool.query(
      `SELECT * FROM video_visit_settings WHERE tenant_id = $1 AND provider_id = $2`,
      [tenantId, providerId]
    )).rows[0];
  }

  values.push(tenantId, providerId);

  const result = await pool.query(
    `UPDATE video_visit_settings
     SET ${setClauses.join(", ")}
     WHERE tenant_id = $${paramCount + 1} AND provider_id = $${paramCount + 2}
     RETURNING *`,
    values
  );

  return result.rows[0];
}
