import { Server } from "socket.io";
import crypto from "crypto";
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

interface SavedChunk {
  chunkIndex: number;
  text: string;
  confidence: number;
  source: "live" | "mock";
  receivedAt: string;
}

const LIVE_TRANSCRIBE_ENABLED = process.env.AMBIENT_LIVE_TRANSCRIBE_ENABLED !== "false";
const MIN_TRANSCRIBE_INTERVAL_MS = Number(process.env.AMBIENT_LIVE_TRANSCRIBE_MIN_INTERVAL_MS || 5000);

/**
 * Save a transcript chunk to the database for persistence and recovery
 */
async function saveTranscriptChunk(
  tenantId: string,
  recordingId: string,
  chunkIndex: number,
  text: string,
  confidence: number,
  source: "live" | "mock"
): Promise<void> {
  try {
    const chunkId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO ambient_live_transcript_chunks (
        id, tenant_id, recording_id, chunk_index, text, confidence, source, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (recording_id, chunk_index) DO UPDATE SET
        text = EXCLUDED.text,
        confidence = EXCLUDED.confidence,
        source = EXCLUDED.source,
        received_at = NOW()`,
      [chunkId, tenantId, recordingId, chunkIndex, text, confidence, source]
    );

    logger.debug("Transcript chunk saved", {
      recordingId,
      chunkIndex,
      textLength: text.length,
    });
  } catch (error: any) {
    // Log but don't throw - we don't want chunk saving to break the live transcription flow
    logger.error("Failed to save transcript chunk", {
      error: error?.message,
      recordingId,
      chunkIndex,
    });
  }
}

/**
 * Retrieve saved transcript chunks for recovery after reconnection
 */
async function getSavedChunks(
  tenantId: string,
  recordingId: string
): Promise<SavedChunk[]> {
  try {
    const result = await pool.query(
      `SELECT chunk_index as "chunkIndex", text, confidence, source, received_at as "receivedAt"
       FROM ambient_live_transcript_chunks
       WHERE tenant_id = $1 AND recording_id = $2 AND is_processed = false
       ORDER BY chunk_index ASC`,
      [tenantId, recordingId]
    );

    return result.rows.map((row) => ({
      chunkIndex: row.chunkIndex,
      text: row.text,
      confidence: parseFloat(row.confidence),
      source: row.source as "live" | "mock",
      receivedAt: row.receivedAt.toISOString(),
    }));
  } catch (error: any) {
    logger.error("Failed to retrieve saved chunks", {
      error: error?.message,
      recordingId,
    });
    return [];
  }
}

/**
 * Get the last saved chunk index for a recording (for recovery)
 */
async function getLastChunkIndex(
  tenantId: string,
  recordingId: string
): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT MAX(chunk_index) as last_index
       FROM ambient_live_transcript_chunks
       WHERE tenant_id = $1 AND recording_id = $2`,
      [tenantId, recordingId]
    );

    return result.rows[0]?.last_index ?? -1;
  } catch (error: any) {
    logger.error("Failed to get last chunk index", {
      error: error?.message,
      recordingId,
    });
    return -1;
  }
}

/**
 * Mark chunks as processed after final transcription is complete
 */
async function markChunksAsProcessed(
  tenantId: string,
  recordingId: string
): Promise<void> {
  try {
    await pool.query(
      `UPDATE ambient_live_transcript_chunks
       SET is_processed = true
       WHERE tenant_id = $1 AND recording_id = $2`,
      [tenantId, recordingId]
    );

    logger.info("Marked live chunks as processed", { recordingId });
  } catch (error: any) {
    logger.error("Failed to mark chunks as processed", {
      error: error?.message,
      recordingId,
    });
  }
}

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

// Export helper functions for use in routes
export {
  markChunksAsProcessed,
  getSavedChunks,
  getLastChunkIndex,
};

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

      // Retrieve any saved chunks for recovery
      const savedChunks = await getSavedChunks(socket.tenantId, recordingId);
      const lastChunkIndex = savedChunks.length > 0
        ? Math.max(...savedChunks.map(c => c.chunkIndex))
        : -1;

      socket.emit("ambient:joined", {
        recordingId,
        joinedAt: new Date().toISOString(),
        // Recovery data - client can use this to resume from where it left off
        recovery: {
          lastChunkIndex,
          savedChunksCount: savedChunks.length,
          savedChunks: savedChunks.map(chunk => ({
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            confidence: chunk.confidence,
            source: chunk.source,
            receivedAt: chunk.receivedAt,
          })),
        },
      });

      if (savedChunks.length > 0) {
        logger.info("Session joined with recovery data", {
          recordingId,
          savedChunksCount: savedChunks.length,
          lastChunkIndex,
        });
      }
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

  // Handle recording completion - marks chunks as processed
  socket.on("ambient:recording-complete", async (payload: AmbientJoinPayload) => {
    if (!socket.user || !socket.tenantId) return;

    const recordingId = payload?.recordingId;
    if (!recordingId) {
      socket.emit("ambient:error", { message: "Recording ID required" });
      return;
    }

    try {
      // Mark all live chunks as processed since they'll be consolidated
      await markChunksAsProcessed(socket.tenantId, recordingId);

      socket.emit("ambient:recording-completed", {
        recordingId,
        completedAt: new Date().toISOString(),
      });

      logger.info("Recording marked complete, chunks processed", {
        recordingId,
        tenantId: socket.tenantId,
      });
    } catch (error: any) {
      logger.error("Failed to complete recording", {
        error: error?.message,
        recordingId,
      });
      socket.emit("ambient:error", {
        recordingId,
        message: "Failed to complete recording",
        details: error?.message || "Unknown error",
      });
    }
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

      const receivedAt = new Date().toISOString();

      // Save transcript chunk to database for persistence/recovery
      // This runs async and doesn't block the response
      saveTranscriptChunk(
        socket.tenantId,
        recordingId,
        payload.chunkIndex,
        result.text,
        result.confidence,
        result.source
      ).catch((err) => {
        logger.warn("Background chunk save failed", {
          error: err?.message,
          recordingId,
          chunkIndex: payload.chunkIndex,
        });
      });

      const eventPayload: AmbientTranscriptEvent = {
        recordingId,
        chunkIndex: payload.chunkIndex,
        text: result.text,
        confidence: result.confidence,
        receivedAt,
        source: result.source,
      };

      io.to(getAmbientRoom(recordingId)).emit("ambient:transcript", eventPayload);
    } catch (error: any) {
      logger.warn("Live transcription failed", {
        error: error?.message,
        recordingId,
        chunkIndex: payload.chunkIndex,
      });
      socket.emit("ambient:error", {
        recordingId,
        message: "Live transcription failed",
        details: error?.message || "Unknown error",
        retryable: true,
      });
    }
  });
}
