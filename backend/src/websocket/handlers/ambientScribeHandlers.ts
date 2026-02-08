import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import { logger } from "../../lib/logger";
import { pool } from "../../db/pool";
import { transcribeLiveAudioChunk } from "../../services/ambientAI";

interface AmbientJoinPayload {
  recordingId: string;
}

interface AmbientAudioChunkPayload {
  recordingId: string;
  chunkIndex: number;
  mimeType?: string;
  data: ArrayBuffer | Buffer | Uint8Array;
}

interface AmbientTranscriptEvent {
  recordingId: string;
  chunkIndex: number;
  text: string;
  confidence: number;
  receivedAt: string;
  source: "live" | "mock";
}

const LIVE_TRANSCRIBE_ENABLED = process.env.AMBIENT_LIVE_TRANSCRIBE_ENABLED !== "false";
const MIN_TRANSCRIBE_INTERVAL_MS = Number(process.env.AMBIENT_LIVE_TRANSCRIBE_MIN_INTERVAL_MS || 5000);

function normalizeAudioBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error("Unsupported audio payload");
}

function getAmbientRoom(recordingId: string): string {
  return `ambient:recording:${recordingId}`;
}

function ensureAmbientSessionState(socket: AuthenticatedSocket) {
  if (!socket.data.ambientSessions) {
    socket.data.ambientSessions = new Map<string, { lastTranscriptAt: number }>();
  }
  return socket.data.ambientSessions as Map<string, { lastTranscriptAt: number }>;
}

async function verifyRecordingAccess(
  tenantId: string,
  recordingId: string
): Promise<boolean> {
  const result = await pool.query(
    "SELECT id FROM ambient_recordings WHERE id = $1 AND tenant_id = $2",
    [recordingId, tenantId]
  );
  return (result.rowCount ?? 0) > 0;
}

export function registerAmbientScribeHandlers(io: Server, socket: AuthenticatedSocket) {
  socket.on("ambient:join", async (payload: AmbientJoinPayload) => {
    try {
      if (!LIVE_TRANSCRIBE_ENABLED) {
        socket.emit("ambient:error", {
          recordingId: payload?.recordingId,
          message: "Live transcription disabled",
        });
        return;
      }

      if (!socket.user || !socket.tenantId) return;
      const recordingId = payload?.recordingId;
      if (!recordingId) {
        socket.emit("ambient:error", { message: "Recording ID required" });
        return;
      }

      const hasAccess = await verifyRecordingAccess(socket.tenantId, recordingId);
      if (!hasAccess) {
        socket.emit("ambient:error", {
          recordingId,
          message: "Recording not found or access denied",
        });
        return;
      }

      socket.join(getAmbientRoom(recordingId));
      const sessions = ensureAmbientSessionState(socket);
      sessions.set(recordingId, { lastTranscriptAt: 0 });

      socket.emit("ambient:joined", {
        recordingId,
        joinedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error("Ambient join failed", {
        error: error?.message,
        recordingId: payload?.recordingId,
      });
      socket.emit("ambient:error", {
        recordingId: payload?.recordingId,
        message: "Failed to join ambient session",
      });
    }
  });

  socket.on("ambient:leave", (payload: AmbientJoinPayload) => {
    const recordingId = payload?.recordingId;
    if (!recordingId) return;
    socket.leave(getAmbientRoom(recordingId));
    const sessions = ensureAmbientSessionState(socket);
    sessions.delete(recordingId);
    socket.emit("ambient:left", {
      recordingId,
      leftAt: new Date().toISOString(),
    });
  });

  socket.on("ambient:audio-chunk", async (payload: AmbientAudioChunkPayload) => {
    if (!LIVE_TRANSCRIBE_ENABLED) return;
    if (!socket.user || !socket.tenantId) return;

    const recordingId = payload?.recordingId;
    if (!recordingId) return;

    const sessions = ensureAmbientSessionState(socket);
    const sessionState = sessions.get(recordingId);
    if (!sessionState) {
      socket.emit("ambient:error", {
        recordingId,
        message: "Join ambient session before streaming audio",
      });
      return;
    }

    const now = Date.now();
    if (now - sessionState.lastTranscriptAt < MIN_TRANSCRIBE_INTERVAL_MS) {
      return;
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = normalizeAudioBuffer(payload.data);
    } catch (error: any) {
      socket.emit("ambient:error", {
        recordingId,
        message: "Invalid audio chunk",
      });
      return;
    }

    if (audioBuffer.length === 0) return;

    try {
      const result = await transcribeLiveAudioChunk(
        audioBuffer,
        payload.mimeType || "audio/webm",
        payload.chunkIndex
      );

      sessionState.lastTranscriptAt = now;

      if (!result.text.trim()) return;

      const eventPayload: AmbientTranscriptEvent = {
        recordingId,
        chunkIndex: payload.chunkIndex,
        text: result.text,
        confidence: result.confidence,
        receivedAt: new Date().toISOString(),
        source: result.source,
      };

      io.to(getAmbientRoom(recordingId)).emit("ambient:transcript", eventPayload);
    } catch (error: any) {
      logger.warn("Live transcription failed", {
        error: error?.message,
        recordingId,
      });
      socket.emit("ambient:error", {
        recordingId,
        message: "Live transcription failed",
      });
    }
  });
}
