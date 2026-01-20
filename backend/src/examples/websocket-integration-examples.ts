/**
 * ========================================================================
 * REFERENCE CODE - NOT COMPILED OR EXECUTED
 * ========================================================================
 *
 * This file contains code examples showing how to integrate WebSocket
 * broadcasting into existing API routes.
 *
 * DO NOT import this file. Copy the relevant patterns into your actual
 * route handlers.
 *
 * The code is commented out to avoid TypeScript compilation errors.
 * Uncomment and adapt the patterns you need in your real route files.
 * ========================================================================
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Request, Response } from 'express';
import type {
  AppointmentEventData,
  MessageEventData,
  MessageReadEventData,
} from '../websocket/types';
import { AuthedRequest } from '../middleware/auth';

// Type-safe imports (commented out since this is example code)
// import {
//   getIO,
//   broadcastAppointmentCreated,
//   broadcastAppointmentUpdated,
//   broadcastAppointmentCancelled,
//   broadcastPatientCheckIn,
//   broadcastNewMessage,
//   broadcastMessageRead,
//   sendUserNotification,
//   notifyTaskAssignment,
//   notifyLabResultReady,
//   broadcastToPatientViewers,
// } from '../websocket';

/**
 * Example 1: Appointment Creation
 * Add to backend/src/routes/appointments.ts
 */
export async function createAppointmentExample(req: AuthedRequest, res: Response) {
  try {
    const { patientId, providerId, locationId, appointmentTypeId, scheduledStart, scheduledEnd } = req.body;

    // Create appointment in database (your existing code)
    const appointment: AppointmentEventData = {
      id: 'appt-123',
      patientId,
      providerId,
      locationId,
      appointmentTypeId,
      scheduledStart,
      scheduledEnd,
      status: 'scheduled' as const,
      // ... other fields
    };

    // NEW: Broadcast to all users in tenant
    // const io = getIO();
    // broadcastAppointmentCreated(io, req.tenantId!, appointment);

    res.status(201).json({ appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
}

/**
 * Example 2: Appointment Status Update
 * Add to backend/src/routes/appointments.ts PATCH /:id/status
 */
export async function updateAppointmentStatusExample(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Update appointment in database
    const appointment = {
      id,
      status,
      // ... fetch full appointment data
    };

    // const io = getIO();

    // Broadcast different events based on status
    // if (status === 'cancelled') {
    //   broadcastAppointmentCancelled(io, req.tenantId!, id, req.body.reason);
    // } else if (status === 'checked_in') {
    //   broadcastPatientCheckIn(io, req.tenantId!, id, appointment.patientId, appointment.patientName);
    // } else {
    //   broadcastAppointmentUpdated(io, req.tenantId!, appointment);
    // }

    res.json({ appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
}

/**
 * Example 3: Message Creation
 * Add to backend/src/routes/messaging.ts POST /:threadId/messages
 */
export async function sendMessageExample(req: AuthedRequest, res: Response) {
  try {
    const { threadId } = req.params;
    const { body } = req.body;

    // Create message in database
    const message = {
      id: 'msg-123',
      threadId,
      body,
      sender: req.user!.id,
      senderFirstName: req.user!.fullName.split(' ')[0],
      senderLastName: req.user!.fullName.split(' ')[1],
      createdAt: new Date().toISOString(),
    };

    // NEW: Broadcast to thread participants
    // const io = getIO();
    // broadcastNewMessage(io, req.tenantId!, threadId, message);

    res.status(201).json({ message });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
}

/**
 * Example 4: Mark Message as Read
 * Add to backend/src/routes/messaging.ts PATCH /messages/:messageId/read
 */
export async function markMessageReadExample(req: AuthedRequest, res: Response) {
  try {
    const { messageId } = req.params;

    // Update message in database
    const message = {
      id: messageId,
      threadId: 'thread-123',
      // ... fetch message data
    };

    // NEW: Broadcast read receipt
    // const io = getIO();
    // broadcastMessageRead(io, req.tenantId!, message.threadId, {
    //   messageId,
    //   threadId: message.threadId,
    //   readBy: req.user!.id,
    //   readAt: new Date().toISOString(),
    // });

    res.json({ message });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
}

/**
 * Example 5: Task Assignment
 * Add to backend/src/routes/tasks.ts POST / or PATCH /:id
 */
export async function assignTaskExample(req: AuthedRequest, res: Response) {
  try {
    const { assignedTo, title, priority } = req.body;

    // Create or update task in database
    const task = {
      id: 'task-123',
      title,
      priority,
      assignedTo,
      // ... other fields
    };

    // NEW: Notify assigned user
    // const io = getIO();
    // notifyTaskAssignment(io, req.tenantId!, assignedTo, {
    //   id: task.id,
    //   title: task.title,
    //   priority: task.priority,
    //   assignedBy: req.user!.fullName,
    // });

    res.status(201).json({ task });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign task' });
  }
}

/**
 * Example 6: Lab Result Ready
 * Add to backend/src/routes/labResults.ts POST / or PATCH /:id
 */
export async function uploadLabResultExample(req: AuthedRequest, res: Response) {
  try {
    const { orderId, resultFlag } = req.body;

    // Process lab result
    const order = {
      id: orderId,
      patientName: 'John Doe',
      orderType: 'Complete Blood Count',
      providerId: 'provider-123',
      resultFlag,
      // ... other fields
    };

    // NEW: Notify provider of results
    // const io = getIO();
    // notifyLabResultReady(io, req.tenantId!, order.providerId, {
    //   id: order.id,
    //   patientName: order.patientName,
    //   orderType: order.orderType,
    //   resultFlag: order.resultFlag,
    // });

    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload lab result' });
  }
}

/**
 * Example 7: Patient Record Update (notify viewers)
 * Add to any route that updates patient data
 */
export async function updatePatientVitalsExample(req: AuthedRequest, res: Response) {
  try {
    const { patientId } = req.params;
    const { bpSystolic, bpDiastolic, pulse, tempC } = req.body;

    // Update vitals in database
    const vitals = {
      patientId,
      bpSystolic,
      bpDiastolic,
      pulse,
      tempC,
      updatedAt: new Date().toISOString(),
    };

    // NEW: Notify all users currently viewing this patient
    // const io = getIO();
    // broadcastToPatientViewers(io, patientId, 'patient:vitals-updated', {
    //   patientId,
    //   vitals,
    // });

    res.json({ vitals });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vitals' });
  }
}

/**
 * Example 8: Custom Notification
 * Send custom notifications for any business logic
 */
export async function sendCustomNotificationExample(req: AuthedRequest, res: Response) {
  try {
    const { userId, title, message, priority } = req.body;

    const notification = {
      id: `notify-${Date.now()}`,
      type: 'general' as const,
      title,
      message,
      priority: priority || 'normal',
      createdAt: new Date().toISOString(),
    };

    // Send to specific user
    // const io = getIO();
    // sendUserNotification(io, req.tenantId!, userId, notification);

    res.json({ notification });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send notification' });
  }
}

/**
 * Example 9: Integration Pattern for Existing Routes
 *
 * How to add WebSocket broadcasting to existing route handlers:
 */
export function integrationPattern() {
  // BEFORE (existing code):
  /*
  export async function updateAppointment(req: AuthedRequest, res: Response) {
    const appointment = await db.updateAppointment(req.params.id, req.body);
    res.json({ appointment });
  }
  */

  // AFTER (with WebSocket):
  /*
  import { getIO, broadcastAppointmentUpdated } from '../websocket';

  export async function updateAppointment(req: AuthedRequest, res: Response) {
    const appointment = await db.updateAppointment(req.params.id, req.body);

    // Add these 2 lines:
    const io = getIO();
    broadcastAppointmentUpdated(io, req.tenantId!, appointment);

    res.json({ appointment });
  }
  */
}

/**
 * Example 10: Error Handling
 * WebSocket broadcasts should not fail the request
 */
export async function withErrorHandlingExample(req: AuthedRequest, res: Response) {
  try {
    // Your main business logic
    const appointment = { id: 'appt-123', /* ... */ };

    // Try to broadcast, but don't fail if WebSocket unavailable
    // try {
    //   const io = getIO();
    //   broadcastAppointmentCreated(io, req.tenantId!, appointment);
    // } catch (wsError) {
    //   // Log error but don't fail the request
    //   console.error('WebSocket broadcast failed:', wsError);
    // }

    res.status(201).json({ appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
}
