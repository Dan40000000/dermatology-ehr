import { Server, Socket } from "socket.io";
import { logger } from "../../lib/logger";
import { AuthenticatedSocket } from "../auth";

/**
 * Message-related WebSocket event handlers
 */

export interface NewMessageEventData {
  id: string;
  threadId: string;
  body: string;
  sender: string;
  senderFirstName?: string;
  senderLastName?: string;
  createdAt: string;
}

export interface MessageReadEventData {
  messageId: string;
  threadId: string;
  readBy: string;
  readAt: string;
}

export interface TypingEventData {
  threadId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

/**
 * Register message-related event listeners on a socket
 */
export function registerMessageHandlers(io: Server, socket: AuthenticatedSocket) {
  // Handle typing indicator
  socket.on("message:typing", (data: { threadId: string; isTyping: boolean }) => {
    if (!socket.user || !socket.tenantId) return;

    const typingData: TypingEventData = {
      threadId: data.threadId,
      userId: socket.user.id,
      userName: socket.user.fullName,
      isTyping: data.isTyping,
    };

    // Broadcast to all other users in the tenant room
    socket.to(`tenant:${socket.tenantId}`).emit("message:typing", typingData);

    logger.debug("User typing status updated", {
      userId: socket.user.id,
      threadId: data.threadId,
      isTyping: data.isTyping,
    });
  });

  // Handle joining thread room for real-time updates
  socket.on("message:join-thread", (threadId: string) => {
    if (!socket.tenantId) return;

    socket.join(`thread:${threadId}`);
    logger.debug("User joined thread room", {
      userId: socket.user?.id,
      threadId,
    });
  });

  // Handle leaving thread room
  socket.on("message:leave-thread", (threadId: string) => {
    socket.leave(`thread:${threadId}`);
    logger.debug("User left thread room", {
      userId: socket.user?.id,
      threadId,
    });
  });
}

/**
 * Broadcast new message to thread participants
 */
export function broadcastNewMessage(
  io: Server,
  tenantId: string,
  threadId: string,
  message: NewMessageEventData
) {
  logger.info("Broadcasting message:new", {
    tenantId,
    threadId,
    messageId: message.id,
  });

  // Send to thread room for real-time updates
  io.to(`thread:${threadId}`).emit("message:new", {
    message,
    timestamp: new Date().toISOString(),
  });

  // Also send to tenant room for unread count updates
  io.to(`tenant:${tenantId}`).emit("message:notification", {
    threadId,
    messageId: message.id,
    sender: message.sender,
    preview: message.body.substring(0, 100),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast message read receipt
 */
export function broadcastMessageRead(
  io: Server,
  tenantId: string,
  threadId: string,
  data: MessageReadEventData
) {
  logger.info("Broadcasting message:read", {
    tenantId,
    threadId,
    messageId: data.messageId,
  });

  io.to(`thread:${threadId}`).emit("message:read", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast unread count update to user
 */
export function broadcastUnreadCountUpdate(
  io: Server,
  tenantId: string,
  userId: string,
  unreadCount: number
) {
  logger.debug("Broadcasting unread count update", {
    tenantId,
    userId,
    unreadCount,
  });

  io.to(`user:${userId}`).emit("message:unread-count", {
    unreadCount,
    timestamp: new Date().toISOString(),
  });
}
