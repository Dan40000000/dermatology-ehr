import { Server, Socket } from "socket.io";
import { logger } from "../../lib/logger";
import { AuthenticatedSocket } from "../auth";

/**
 * User presence and activity tracking handlers
 */

export interface UserPresenceData {
  userId: string;
  userName: string;
  status: "online" | "offline" | "away";
  lastSeen: string;
}

export interface PatientViewingData {
  userId: string;
  userName: string;
  patientId: string;
  isViewing: boolean;
  startedAt?: string;
}

// In-memory store for presence data (could be moved to Redis for production)
const userPresence = new Map<string, UserPresenceData>();
const patientViewers = new Map<string, Set<string>>(); // patientId -> Set of userIds

/**
 * Register presence-related event listeners on a socket
 */
export function registerPresenceHandlers(io: Server, socket: AuthenticatedSocket) {
  if (!socket.user || !socket.tenantId) return;

  const userId = socket.user.id;
  const tenantId = socket.tenantId;

  // Mark user as online
  const presenceData: UserPresenceData = {
    userId: socket.user.id,
    userName: socket.user.fullName,
    status: "online",
    lastSeen: new Date().toISOString(),
  };

  userPresence.set(userId, presenceData);

  // Broadcast user online status
  socket.to(`tenant:${tenantId}`).emit("user:online", presenceData);

  // Handle status change
  socket.on("user:status", (status: "online" | "away") => {
    const updated: UserPresenceData = {
      ...presenceData,
      status,
      lastSeen: new Date().toISOString(),
    };
    userPresence.set(userId, updated);
    socket.to(`tenant:${tenantId}`).emit("user:status", updated);

    logger.debug("User status updated", {
      userId,
      status,
    });
  });

  // Handle patient viewing
  socket.on("patient:viewing", (data: { patientId: string; isViewing: boolean }) => {
    const viewingData: PatientViewingData = {
      userId: socket.user!.id,
      userName: socket.user!.fullName,
      patientId: data.patientId,
      isViewing: data.isViewing,
      startedAt: data.isViewing ? new Date().toISOString() : undefined,
    };

    if (data.isViewing) {
      // Add to viewers set
      if (!patientViewers.has(data.patientId)) {
        patientViewers.set(data.patientId, new Set());
      }
      patientViewers.get(data.patientId)!.add(userId);

      // Join patient room
      socket.join(`patient:${data.patientId}`);
    } else {
      // Remove from viewers set
      patientViewers.get(data.patientId)?.delete(userId);
      if (patientViewers.get(data.patientId)?.size === 0) {
        patientViewers.delete(data.patientId);
      }

      // Leave patient room
      socket.leave(`patient:${data.patientId}`);
    }

    // Broadcast to tenant
    socket.to(`tenant:${tenantId}`).emit("patient:viewing", viewingData);

    logger.debug("Patient viewing status updated", {
      userId,
      patientId: data.patientId,
      isViewing: data.isViewing,
    });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    // Mark user as offline
    const offlineData: UserPresenceData = {
      userId: socket.user!.id,
      userName: socket.user!.fullName,
      status: "offline",
      lastSeen: new Date().toISOString(),
    };

    userPresence.set(userId, offlineData);
    io.to(`tenant:${tenantId}`).emit("user:offline", offlineData);

    // Clean up patient viewing
    for (const [patientId, viewers] of patientViewers.entries()) {
      if (viewers.has(userId)) {
        viewers.delete(userId);
        const viewingData: PatientViewingData = {
          userId: socket.user!.id,
          userName: socket.user!.fullName,
          patientId,
          isViewing: false,
        };
        io.to(`tenant:${tenantId}`).emit("patient:viewing", viewingData);

        if (viewers.size === 0) {
          patientViewers.delete(patientId);
        }
      }
    }

    logger.info("User disconnected", {
      userId,
      tenantId,
    });
  });
}

/**
 * Get currently online users for a tenant
 */
export function getOnlineUsers(tenantId: string): UserPresenceData[] {
  return Array.from(userPresence.values()).filter((p) => p.status !== "offline");
}

/**
 * Get current viewers of a patient
 */
export function getPatientViewers(patientId: string): string[] {
  return Array.from(patientViewers.get(patientId) || []);
}

/**
 * Broadcast to everyone viewing a specific patient
 */
export function broadcastToPatientViewers(
  io: Server,
  patientId: string,
  event: string,
  data: any
) {
  logger.debug("Broadcasting to patient viewers", {
    patientId,
    event,
    viewerCount: patientViewers.get(patientId)?.size || 0,
  });

  io.to(`patient:${patientId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
