import express from "express";
import multer from "multer";
import path from "path";
import { voiceTranscriptionService } from "../services/voiceTranscription";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { logger } from "../lib/logger";
import { auditLog } from "../services/audit";

const router = express.Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logVoiceTranscriptionError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * Voice Transcription Routes
 *
 * Medical dictation endpoints using OpenAI transcription API
 */

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/audio/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "audio-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow common audio formats
    const allowedFormats = [
      ".mp3",
      ".mp4",
      ".m4a",
      ".wav",
      ".webm",
      ".ogg",
      ".flac",
      ".mpeg",
      ".mpga",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedFormats.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid audio format. Supported formats: MP3, WAV, M4A, WebM, OGG, FLAC"));
    }
  },
});

// POST /api/voice/transcribe - Upload and transcribe audio
router.post(
  "/transcribe",
  requireAuth,
  upload.single("audio"),
  async (req: AuthedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { encounterId, language } = req.body;

      const result = await voiceTranscriptionService.transcribeAudio({
        audioFile: req.file.path,
        encounterId: encounterId || undefined,
        userId,
        tenantId,
        language: language || "en",
      });

      await auditLog(tenantId, userId, "voice_transcribe", "transcription", result.id!);

      res.json({
        transcription: result,
        message: "Audio transcribed successfully",
      });
    } catch (error: any) {
      logVoiceTranscriptionError("Transcription error", error);
      res.status(500).json({ error: error.message || "Failed to transcribe audio" });
    }
  }
);

// GET /api/voice/transcriptions/:id - Get transcription by ID
router.get("/transcriptions/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const transcription = await voiceTranscriptionService.getTranscription(id!, tenantId);

    if (!transcription) {
      return res.status(404).json({ error: "Transcription not found" });
    }

    res.json({ transcription });
  } catch (error) {
    logVoiceTranscriptionError("Get transcription error", error);
    res.status(500).json({ error: "Failed to retrieve transcription" });
  }
});

// GET /api/voice/encounters/:encounterId - Get all transcriptions for encounter
router.get("/encounters/:encounterId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { encounterId } = req.params;
    const tenantId = req.user!.tenantId;

    const transcriptions = await voiceTranscriptionService.getEncounterTranscriptions(
      encounterId!,
      tenantId
    );

    res.json({ transcriptions });
  } catch (error) {
    logVoiceTranscriptionError("Get encounter transcriptions error", error);
    res.status(500).json({ error: "Failed to retrieve transcriptions" });
  }
});

// POST /api/voice/transcriptions/:id/to-note - Convert transcription to note sections
router.post(
  "/transcriptions/:id/to-note",
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const transcription = await voiceTranscriptionService.getTranscription(id!, tenantId);

      if (!transcription) {
        return res.status(404).json({ error: "Transcription not found" });
      }

      const sections = await voiceTranscriptionService.transcriptionToNoteSections(
        transcription.transcriptionText!
      );

      res.json({ sections });
    } catch (error) {
      logVoiceTranscriptionError("Convert to note error", error);
      res.status(500).json({ error: "Failed to convert transcription to note" });
    }
  }
);

// GET /api/voice/stats - Get transcription statistics
router.get("/stats", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const stats = await voiceTranscriptionService.getTranscriptionStats(tenantId, userId);

    res.json({
      ...stats,
      totalDurationMinutes: Math.round((stats.totalDurationSeconds || 0) / 60),
    });
  } catch (error) {
    logVoiceTranscriptionError("Get stats error", error);
    res.status(500).json({ error: "Failed to retrieve statistics" });
  }
});

// DELETE /api/voice/transcriptions/:id - Delete transcription
router.delete(
  "/transcriptions/:id",
  requireAuth,
  requireRoles(["provider", "admin"]),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const deleted = await voiceTranscriptionService.deleteTranscription(id!, tenantId);

      if (!deleted) {
        return res.status(404).json({ error: "Transcription not found" });
      }

      await auditLog(tenantId, userId, "transcription_delete", "transcription", id!);
      res.json({ success: true });
    } catch (error) {
      logVoiceTranscriptionError("Delete transcription error", error);
      res.status(500).json({ error: "Failed to delete transcription" });
    }
  }
);

export default router;
