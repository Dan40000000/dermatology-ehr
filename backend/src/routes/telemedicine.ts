import { Router, Response } from "express";
import { body, param, query, validationResult } from "express-validator";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import {
  createVideoSession,
  joinSession,
  startSession,
  endSession,
  capturePhoto,
  getWaitingRoom,
  addToWaitingRoom,
  updateDeviceCheck,
  callNextPatient,
  addParticipant,
  recordConsent,
  checkConsent,
  getSessionDetails,
  getProviderSessions,
  getOrCreateSessionNotes,
  updateSessionNotes,
  getProviderSettings,
  updateProviderSettings,
} from "../services/telemedicineService";

const router = Router();
router.use(requireAuth);

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * @swagger
 * /api/telemedicine/sessions:
 *   post:
 *     summary: Create a new video visit session
 *     tags: [Telemedicine]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentId
 *             properties:
 *               appointmentId:
 *                 type: integer
 *               enableRecording:
 *                 type: boolean
 *               enableWaitingRoom:
 *                 type: boolean
 *               maxParticipants:
 *                 type: integer
 */
router.post(
  "/sessions",
  [
    body("appointmentId").isInt().withMessage("Appointment ID is required"),
    body("enableRecording").optional().isBoolean(),
    body("enableWaitingRoom").optional().isBoolean(),
    body("maxParticipants").optional().isInt({ min: 2, max: 10 }),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const { appointmentId, enableRecording, enableWaitingRoom, maxParticipants } = req.body;

    try {
      const session = await createVideoSession(tenantId, appointmentId, {
        enableRecording,
        enableWaitingRoom,
        maxParticipants,
      });

      res.status(201).json(session);
    } catch (error: unknown) {
      console.error("Error creating video session:", error);
      const message = error instanceof Error ? error.message : "Failed to create video session";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/telemedicine/sessions/{id}:
 *   get:
 *     summary: Get session details
 *     tags: [Telemedicine]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 */
router.get("/sessions/:id", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);

  try {
    const session = await getSessionDetails(tenantId, sessionId);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json(session);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/join:
 *   get:
 *     summary: Get join URL and token for a session
 *     tags: [Telemedicine]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: participantType
 *         in: query
 *         schema:
 *           type: string
 *           enum: [patient, provider, interpreter, family, caregiver, specialist]
 *       - name: participantId
 *         in: query
 *         schema:
 *           type: integer
 */
router.get(
  "/sessions/:id/join",
  [
    param("id").isInt(),
    query("participantType")
      .optional()
      .isIn(["patient", "provider", "interpreter", "family", "caregiver", "specialist"]),
    query("participantId").optional().isInt(),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId as string;
    const sessionId = parseInt(req.params.id as string, 10);
    const participantType = (req.query.participantType as string) || "provider";
    const participantId = req.query.participantId
      ? parseInt(req.query.participantId as string, 10)
      : undefined;

    try {
      const joinInfo = await joinSession(
        tenantId,
        sessionId,
        participantType as "patient" | "provider" | "interpreter" | "family" | "caregiver" | "specialist",
        participantId
      );

      res.json(joinInfo);
    } catch (error: unknown) {
      console.error("Error getting join info:", error);
      const message = error instanceof Error ? error.message : "Failed to get join information";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/start:
 *   post:
 *     summary: Provider starts the video visit
 *     tags: [Telemedicine]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 */
router.post("/sessions/:id/start", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);
  const providerId = parseInt(req.user!.id as string, 10);

  try {
    const session = await startSession(tenantId, sessionId, providerId);
    res.json(session);
  } catch (error: unknown) {
    console.error("Error starting session:", error);
    const message = error instanceof Error ? error.message : "Failed to start session";
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/end:
 *   post:
 *     summary: End the video visit
 *     tags: [Telemedicine]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 */
router.post("/sessions/:id/end", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);

  try {
    const session = await endSession(tenantId, sessionId);
    res.json(session);
  } catch (error: unknown) {
    console.error("Error ending session:", error);
    const message = error instanceof Error ? error.message : "Failed to end session";
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/capture:
 *   post:
 *     summary: Capture a photo during the video visit
 *     tags: [Telemedicine]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filePath
 *             properties:
 *               filePath:
 *                 type: string
 *               bodySite:
 *                 type: string
 *               description:
 *                 type: string
 *               annotations:
 *                 type: object
 */
router.post(
  "/sessions/:id/capture",
  [
    param("id").isInt(),
    body("filePath").isString().notEmpty(),
    body("bodySite").optional().isString(),
    body("description").optional().isString(),
    body("annotations").optional().isObject(),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId as string;
    const sessionId = parseInt(req.params.id as string, 10);
    const providerId = parseInt(req.user!.id as string, 10);
    const { filePath, fileSizeBytes, bodySite, description, annotations } = req.body;

    try {
      const photo = await capturePhoto(
        tenantId,
        sessionId,
        { filePath, fileSizeBytes, bodySite, description, annotations },
        providerId
      );

      res.status(201).json(photo);
    } catch (error: unknown) {
      console.error("Error capturing photo:", error);
      const message = error instanceof Error ? error.message : "Failed to capture photo";
      res.status(500).json({ error: message });
    }
  }
);

// ============================================
// WAITING ROOM
// ============================================

/**
 * @swagger
 * /api/telemedicine/waiting-room:
 *   get:
 *     summary: Get provider's waiting room queue
 *     tags: [Telemedicine]
 */
router.get("/waiting-room", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const providerId = parseInt(req.user!.id as string, 10);

  try {
    const queue = await getWaitingRoom(tenantId, providerId);
    res.json(queue);
  } catch (error) {
    console.error("Error fetching waiting room:", error);
    res.status(500).json({ error: "Failed to fetch waiting room" });
  }
});

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/join-queue:
 *   post:
 *     summary: Patient joins the waiting room
 *     tags: [Telemedicine]
 */
router.post("/sessions/:id/join-queue", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);

  try {
    const queueEntry = await addToWaitingRoom(tenantId, sessionId);
    res.status(201).json(queueEntry);
  } catch (error: unknown) {
    console.error("Error joining waiting room:", error);
    const message = error instanceof Error ? error.message : "Failed to join waiting room";
    res.status(500).json({ error: message });
  }
});

/**
 * @swagger
 * /api/telemedicine/waiting-room/{id}/device-check:
 *   patch:
 *     summary: Update device check status for waiting patient
 *     tags: [Telemedicine]
 */
router.patch(
  "/waiting-room/:id/device-check",
  [
    param("id").isInt(),
    body("camera").optional().isBoolean(),
    body("microphone").optional().isBoolean(),
    body("speaker").optional().isBoolean(),
    body("bandwidth").optional().isBoolean(),
    body("browser").optional().isBoolean(),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId as string;
    const queueId = parseInt(req.params.id as string, 10);
    const { camera, microphone, speaker, bandwidth, browser } = req.body;

    try {
      const updated = await updateDeviceCheck(tenantId, queueId, {
        camera,
        microphone,
        speaker,
        bandwidth,
        browser,
      });

      res.json(updated);
    } catch (error: unknown) {
      console.error("Error updating device check:", error);
      const message = error instanceof Error ? error.message : "Failed to update device check";
      res.status(500).json({ error: message });
    }
  }
);

/**
 * @swagger
 * /api/telemedicine/waiting-room/call-next:
 *   post:
 *     summary: Call the next patient from the waiting room
 *     tags: [Telemedicine]
 */
router.post("/waiting-room/call-next", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const providerId = parseInt(req.user!.id as string, 10);

  try {
    const nextPatient = await callNextPatient(tenantId, providerId);

    if (!nextPatient) {
      return res.status(404).json({ message: "No patients waiting" });
    }

    res.json(nextPatient);
  } catch (error) {
    console.error("Error calling next patient:", error);
    res.status(500).json({ error: "Failed to call next patient" });
  }
});

// ============================================
// MULTI-PARTICIPANT
// ============================================

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/participants:
 *   post:
 *     summary: Add a participant to the session (interpreter, family member, etc.)
 *     tags: [Telemedicine]
 */
router.post(
  "/sessions/:id/participants",
  [
    param("id").isInt(),
    body("type").isIn(["interpreter", "family", "caregiver", "specialist"]),
    body("name").isString().notEmpty(),
    body("email").optional().isEmail(),
    body("language").optional().isString(),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId as string;
    const sessionId = parseInt(req.params.id as string, 10);
    const { type, name, email, language } = req.body;

    try {
      const participant = await addParticipant(tenantId, sessionId, {
        type,
        name,
        email,
        language,
      });

      res.status(201).json(participant);
    } catch (error: unknown) {
      console.error("Error adding participant:", error);
      const message = error instanceof Error ? error.message : "Failed to add participant";
      res.status(500).json({ error: message });
    }
  }
);

// ============================================
// CONSENT MANAGEMENT
// ============================================

/**
 * @swagger
 * /api/telemedicine/consent:
 *   post:
 *     summary: Record telehealth consent
 *     tags: [Telemedicine]
 */
router.post(
  "/consent",
  [
    body("patientId").isInt(),
    body("consentType").isIn([
      "general_telehealth",
      "recording",
      "photo_capture",
      "screen_share",
      "multi_participant",
    ]),
    body("consentGiven").isBoolean(),
    body("consentMethod").optional().isIn(["verbal", "written", "electronic", "in_app"]),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const { patientId, consentType, consentGiven, consentMethod } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.get("user-agent");

    try {
      const consent = await recordConsent(tenantId, patientId, {
        consentType,
        consentGiven,
        ipAddress,
        userAgent,
        consentMethod,
      });

      res.status(201).json(consent);
    } catch (error) {
      console.error("Error recording consent:", error);
      res.status(500).json({ error: "Failed to record consent" });
    }
  }
);

/**
 * @swagger
 * /api/telemedicine/consent/check:
 *   get:
 *     summary: Check if patient has valid consent
 *     tags: [Telemedicine]
 */
router.get(
  "/consent/check",
  [
    query("patientId").isInt(),
    query("consentType").isIn([
      "general_telehealth",
      "recording",
      "photo_capture",
      "screen_share",
      "multi_participant",
    ]),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const patientId = parseInt(req.query.patientId as string, 10);
    const consentType = req.query.consentType as string;

    try {
      const hasConsent = await checkConsent(tenantId, patientId, consentType);
      res.json({ hasConsent });
    } catch (error) {
      console.error("Error checking consent:", error);
      res.status(500).json({ error: "Failed to check consent" });
    }
  }
);

// ============================================
// SESSION NOTES
// ============================================

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/notes:
 *   get:
 *     summary: Get session notes
 *     tags: [Telemedicine]
 */
router.get("/sessions/:id/notes", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);

  try {
    const notes = await getOrCreateSessionNotes(tenantId, sessionId);
    res.json(notes);
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

/**
 * @swagger
 * /api/telemedicine/sessions/{id}/notes:
 *   patch:
 *     summary: Update session notes
 *     tags: [Telemedicine]
 */
router.patch("/sessions/:id/notes", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId as string;
  const sessionId = parseInt(req.params.id as string, 10);

  try {
    const notes = await updateSessionNotes(tenantId, sessionId, req.body);
    res.json(notes);
  } catch (error) {
    console.error("Error updating notes:", error);
    res.status(500).json({ error: "Failed to update notes" });
  }
});

// ============================================
// PROVIDER SESSIONS LIST
// ============================================

/**
 * @swagger
 * /api/telemedicine/provider/sessions:
 *   get:
 *     summary: Get all sessions for the current provider
 *     tags: [Telemedicine]
 */
router.get(
  "/provider/sessions",
  [
    query("status").optional().isString(),
    query("startDate").optional().isISO8601(),
    query("endDate").optional().isISO8601(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const providerId = parseInt(req.user!.id, 10);
    const { status, startDate, endDate, limit } = req.query;

    try {
      const sessions = await getProviderSessions(tenantId, providerId, {
        status: status as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.json(sessions);
    } catch (error) {
      console.error("Error fetching provider sessions:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  }
);

// ============================================
// PROVIDER SETTINGS
// ============================================

/**
 * @swagger
 * /api/telemedicine/settings:
 *   get:
 *     summary: Get provider video visit settings
 *     tags: [Telemedicine]
 */
router.get("/settings", async (req: AuthedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const providerId = parseInt(req.user!.id, 10);

  try {
    const settings = await getProviderSettings(tenantId, providerId);
    res.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

/**
 * @swagger
 * /api/telemedicine/settings:
 *   patch:
 *     summary: Update provider video visit settings
 *     tags: [Telemedicine]
 */
router.patch(
  "/settings",
  [
    body("virtualBackgroundUrl").optional().isString(),
    body("virtualBackgroundType").optional().isIn(["none", "blur", "image", "clinic"]),
    body("waitingRoomEnabled").optional().isBoolean(),
    body("autoRecord").optional().isBoolean(),
    body("maxDurationMinutes").optional().isInt({ min: 15, max: 180 }),
    body("autoEndWarningMinutes").optional().isInt({ min: 1, max: 30 }),
    body("screenShareEnabled").optional().isBoolean(),
    body("photoCaptureEnabled").optional().isBoolean(),
    body("multiParticipantEnabled").optional().isBoolean(),
    body("maxParticipants").optional().isInt({ min: 2, max: 10 }),
  ],
  async (req: AuthedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenantId = req.user!.tenantId;
    const providerId = parseInt(req.user!.id, 10);

    try {
      const settings = await updateProviderSettings(tenantId, providerId, {
        virtual_background_url: req.body.virtualBackgroundUrl,
        virtual_background_type: req.body.virtualBackgroundType,
        waiting_room_enabled: req.body.waitingRoomEnabled,
        auto_record: req.body.autoRecord,
        max_duration_minutes: req.body.maxDurationMinutes,
        auto_end_warning_minutes: req.body.autoEndWarningMinutes,
        screen_share_enabled: req.body.screenShareEnabled,
        photo_capture_enabled: req.body.photoCaptureEnabled,
        multi_participant_enabled: req.body.multiParticipantEnabled,
        max_participants: req.body.maxParticipants,
      });

      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  }
);

export default router;
