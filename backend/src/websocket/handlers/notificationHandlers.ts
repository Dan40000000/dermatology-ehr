import { Server } from "socket.io";
import { logger } from "../../lib/logger";

/**
 * Notification-related WebSocket event handlers
 */

export type NotificationType =
  | "task_assigned"
  | "prior_auth_status"
  | "lab_result_ready"
  | "urgent_alert"
  | "appointment_reminder"
  | "message_received"
  | "prescription_ready"
  | "general";

export interface NotificationEventData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  relatedEntityType?: "appointment" | "task" | "order" | "message" | "prescription" | "patient";
  relatedEntityId?: string;
  actionUrl?: string;
  createdAt: string;
}

/**
 * Send notification to specific user
 */
export function sendUserNotification(
  io: Server,
  tenantId: string,
  userId: string,
  notification: NotificationEventData
) {
  logger.info("Sending notification to user", {
    tenantId,
    userId,
    notificationId: notification.id,
    type: notification.type,
  });

  io.to(`user:${userId}`).emit("notification:new", {
    notification,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast notification to entire tenant
 */
export function broadcastTenantNotification(
  io: Server,
  tenantId: string,
  notification: NotificationEventData
) {
  logger.info("Broadcasting notification to tenant", {
    tenantId,
    notificationId: notification.id,
    type: notification.type,
  });

  io.to(`tenant:${tenantId}`).emit("notification:new", {
    notification,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send task assignment notification
 */
export function notifyTaskAssignment(
  io: Server,
  tenantId: string,
  userId: string,
  taskData: {
    id: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    dueDate?: string;
    assignedBy: string;
  }
) {
  const notification: NotificationEventData = {
    id: `notify-${Date.now()}`,
    type: "task_assigned",
    title: "New Task Assigned",
    message: `You have been assigned: ${taskData.title}`,
    priority: taskData.priority,
    relatedEntityType: "task",
    relatedEntityId: taskData.id,
    actionUrl: `/tasks/${taskData.id}`,
    createdAt: new Date().toISOString(),
  };

  sendUserNotification(io, tenantId, userId, notification);
}

/**
 * Send prior auth status change notification
 */
export function notifyPriorAuthStatusChange(
  io: Server,
  tenantId: string,
  userId: string,
  priorAuthData: {
    id: string;
    patientName: string;
    status: string;
    medication?: string;
  }
) {
  const notification: NotificationEventData = {
    id: `notify-${Date.now()}`,
    type: "prior_auth_status",
    title: "Prior Authorization Update",
    message: `Prior auth for ${priorAuthData.patientName} is now ${priorAuthData.status}`,
    priority: "normal",
    relatedEntityType: "task",
    relatedEntityId: priorAuthData.id,
    actionUrl: `/prior-auth/${priorAuthData.id}`,
    createdAt: new Date().toISOString(),
  };

  sendUserNotification(io, tenantId, userId, notification);
}

/**
 * Send lab result ready notification
 */
export function notifyLabResultReady(
  io: Server,
  tenantId: string,
  userId: string,
  labData: {
    id: string;
    patientName: string;
    orderType: string;
    resultFlag?: string;
  }
) {
  const isUrgent = labData.resultFlag === "panic_value" || labData.resultFlag === "cancerous";

  const notification: NotificationEventData = {
    id: `notify-${Date.now()}`,
    type: "lab_result_ready",
    title: isUrgent ? "URGENT: Lab Result Ready" : "Lab Result Ready",
    message: `Lab results ready for ${labData.patientName}: ${labData.orderType}`,
    priority: isUrgent ? "urgent" : "normal",
    relatedEntityType: "order",
    relatedEntityId: labData.id,
    actionUrl: `/orders/${labData.id}`,
    createdAt: new Date().toISOString(),
  };

  sendUserNotification(io, tenantId, userId, notification);
}

/**
 * Send urgent alert notification to entire tenant
 */
export function sendUrgentAlert(
  io: Server,
  tenantId: string,
  alertData: {
    title: string;
    message: string;
    relatedEntityType?: "appointment" | "task" | "order" | "message" | "prescription" | "patient";
    relatedEntityId?: string;
    actionUrl?: string;
  }
) {
  const notification: NotificationEventData = {
    id: `notify-${Date.now()}`,
    type: "urgent_alert",
    title: alertData.title,
    message: alertData.message,
    priority: "urgent",
    relatedEntityType: alertData.relatedEntityType,
    relatedEntityId: alertData.relatedEntityId,
    actionUrl: alertData.actionUrl,
    createdAt: new Date().toISOString(),
  };

  broadcastTenantNotification(io, tenantId, notification);
}
