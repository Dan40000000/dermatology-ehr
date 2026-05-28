import { Server as HTTPServer } from "http";
import { Server, ServerOptions } from "socket.io";
import { authenticateSocket, AuthenticatedSocket } from "./auth";
import { logger } from "../lib/logger";
import { registerMessageHandlers } from "./handlers/messageHandlers";
import { registerPresenceHandlers } from "./handlers/presenceHandlers";
import { registerAmbientScribeHandlers } from "./handlers/ambientScribeHandlers";
import { registerPatientFlowHandlers } from "./handlers/patientFlowHandlers";
import { config } from "../config";
import { canAccessModule, moduleAccess, type ModuleKey } from "../config/moduleAccess";

// Export the io instance for use in other parts of the application
let io: Server | null = null;

/**
 * Initialize WebSocket server with authentication and room management
 */
export function initializeWebSocket(httpServer: HTTPServer): Server {
  const socketOptions: Partial<ServerOptions> = {
    cors: {
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: ["GET", "POST"],
    },
    // Connection state recovery (helps with reconnections)
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: false,
    },
    // Ping/pong for connection health
    pingInterval: 25000,
    pingTimeout: 20000,
    // Max reconnection attempts
    transports: ["websocket", "polling"],
  };

  io = new Server(httpServer, socketOptions);

  // Apply authentication middleware
  io.use(authenticateSocket);

  // Handle new connections
  io.on("connection", (socket: AuthenticatedSocket) => {
    if (!socket.user || !socket.tenantId) {
      logger.warn("Unauthenticated socket connection", {
        socketId: socket.id,
      });
      socket.disconnect();
      return;
    }

    logger.info("WebSocket client connected", {
      socketId: socket.id,
      userId: socket.user.id,
      userName: socket.user.fullName,
      tenantId: socket.tenantId,
      role: socket.user.role,
    });

    const moduleRooms = (Object.keys(moduleAccess) as ModuleKey[])
      .filter((moduleKey) => canAccessModule(socket.user?.roles || socket.user?.role, moduleKey))
      .map((moduleKey) => `tenant:${socket.tenantId}:module:${moduleKey}`);

    moduleRooms.forEach((room) => socket.join(room));
    logger.debug("Socket joined module rooms", {
      socketId: socket.id,
      tenantId: socket.tenantId,
      rooms: moduleRooms,
    });

    // Join user room (for user-specific messages)
    socket.join(`user:${socket.user.id}`);
    logger.debug("Socket joined user room", {
      socketId: socket.id,
      userId: socket.user.id,
    });

    // Register event handlers
    registerMessageHandlers(io!, socket);
    registerPresenceHandlers(io!, socket);
    registerAmbientScribeHandlers(io!, socket);
    registerPatientFlowHandlers(io!, socket);

    // Handle errors
    socket.on("error", (error) => {
      logger.error("WebSocket error", {
        socketId: socket.id,
        userId: socket.user?.id,
        error: error.message,
      });
    });

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      logger.info("WebSocket client disconnected", {
        socketId: socket.id,
        userId: socket.user?.id,
        reason,
      });
    });
  });

  logger.info("WebSocket server initialized");

  return io;
}

/**
 * Get the Socket.IO server instance
 * This allows other parts of the application to emit events
 */
export function getIO(): Server {
  if (!io) {
    throw new Error("WebSocket server not initialized. Call initializeWebSocket first.");
  }
  return io;
}

/**
 * Gracefully close WebSocket server
 */
export async function closeWebSocket(): Promise<void> {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => {
        logger.info("WebSocket server closed");
        resolve();
      });
    });
    io = null;
  }
}

// Export all handlers for use in API routes
export * from "./handlers";
