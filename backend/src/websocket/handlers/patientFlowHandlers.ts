import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../auth';
import { logger } from '../../lib/logger';

/**
 * Register WebSocket handlers for patient flow events
 */
export function registerPatientFlowHandlers(io: Server, socket: AuthenticatedSocket): void {
  const tenantId = socket.tenantId;

  if (!tenantId) {
    logger.warn('Socket missing tenantId for patient flow handlers');
    return;
  }

  // Join patient flow room for real-time updates
  socket.on('patient-flow:subscribe', (data: { locationId?: string }) => {
    const roomName = data.locationId
      ? `patient-flow:${tenantId}:${data.locationId}`
      : `patient-flow:${tenantId}`;

    socket.join(roomName);
    logger.debug('Socket subscribed to patient flow', {
      socketId: socket.id,
      userId: socket.user?.id,
      roomName,
    });
  });

  // Leave patient flow room
  socket.on('patient-flow:unsubscribe', (data: { locationId?: string }) => {
    const roomName = data.locationId
      ? `patient-flow:${tenantId}:${data.locationId}`
      : `patient-flow:${tenantId}`;

    socket.leave(roomName);
    logger.debug('Socket unsubscribed from patient flow', {
      socketId: socket.id,
      userId: socket.user?.id,
      roomName,
    });
  });

  // Subscribe to specific room updates
  socket.on('room-board:subscribe', (data: { locationId: string }) => {
    if (!data.locationId) {
      logger.warn('Missing locationId for room board subscription');
      return;
    }

    const roomName = `room-board:${tenantId}:${data.locationId}`;
    socket.join(roomName);
    logger.debug('Socket subscribed to room board', {
      socketId: socket.id,
      userId: socket.user?.id,
      locationId: data.locationId,
    });
  });

  socket.on('room-board:unsubscribe', (data: { locationId: string }) => {
    if (!data.locationId) return;

    const roomName = `room-board:${tenantId}:${data.locationId}`;
    socket.leave(roomName);
    logger.debug('Socket unsubscribed from room board', {
      socketId: socket.id,
      userId: socket.user?.id,
      locationId: data.locationId,
    });
  });

  // Subscribe to provider queue updates
  socket.on('provider-queue:subscribe', (data: { providerId: string }) => {
    if (!data.providerId) {
      logger.warn('Missing providerId for provider queue subscription');
      return;
    }

    const roomName = `provider-queue:${tenantId}:${data.providerId}`;
    socket.join(roomName);
    logger.debug('Socket subscribed to provider queue', {
      socketId: socket.id,
      userId: socket.user?.id,
      providerId: data.providerId,
    });
  });

  socket.on('provider-queue:unsubscribe', (data: { providerId: string }) => {
    if (!data.providerId) return;

    const roomName = `provider-queue:${tenantId}:${data.providerId}`;
    socket.leave(roomName);
    logger.debug('Socket unsubscribed from provider queue', {
      socketId: socket.id,
      userId: socket.user?.id,
      providerId: data.providerId,
    });
  });
}

/**
 * Emit patient flow status update to all relevant rooms
 */
export function emitPatientFlowUpdate(
  io: Server,
  tenantId: string,
  data: {
    flowId: string;
    appointmentId: string;
    patientId: string;
    roomId?: string;
    locationId?: string;
    providerId?: string;
    status: string;
    previousStatus?: string;
    patientName?: string;
    roomNumber?: string;
  }
): void {
  const eventData = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  // Emit to tenant-wide patient flow subscribers
  io.to(`tenant:${tenantId}`).emit('patient-flow:updated', eventData);

  // Emit to location-specific room board subscribers
  if (data.locationId) {
    io.to(`room-board:${tenantId}:${data.locationId}`).emit('room-board:updated', eventData);
  }

  // Emit to provider queue subscribers
  if (data.providerId) {
    io.to(`provider-queue:${tenantId}:${data.providerId}`).emit('provider-queue:updated', eventData);
  }

  logger.debug('Emitted patient flow update', {
    tenantId,
    flowId: data.flowId,
    status: data.status,
  });
}

/**
 * Emit room status change event
 */
export function emitRoomStatusChange(
  io: Server,
  tenantId: string,
  locationId: string,
  data: {
    roomId: string;
    roomNumber: string;
    status: 'occupied' | 'empty' | 'cleaning';
    patientId?: string;
    patientName?: string;
  }
): void {
  const eventData = {
    ...data,
    timestamp: new Date().toISOString(),
  };

  io.to(`room-board:${tenantId}:${locationId}`).emit('room:status-changed', eventData);

  logger.debug('Emitted room status change', {
    tenantId,
    locationId,
    roomId: data.roomId,
    status: data.status,
  });
}
