import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { patientFlowService, FlowStatus } from '../services/patientFlowService';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const flowStatusEnum = z.enum([
  'checked_in',
  'rooming',
  'vitals_complete',
  'ready_for_provider',
  'with_provider',
  'checkout',
  'completed',
]);

const updateStatusSchema = z.object({
  status: flowStatusEnum,
  roomId: z.string().optional(),
  notes: z.string().optional(),
});

const createRoomSchema = z.object({
  roomName: z.string().min(1),
  roomNumber: z.string().min(1),
  locationId: z.string().min(1),
  roomType: z.enum(['exam', 'procedure', 'consult', 'triage']).optional(),
  equipment: z.array(z.string()).optional(),
  notes: z.string().optional(),
  displayOrder: z.number().optional(),
});

const updateRoomSchema = z.object({
  roomName: z.string().min(1).optional(),
  roomNumber: z.string().min(1).optional(),
  roomType: z.enum(['exam', 'procedure', 'consult', 'triage']).optional(),
  isActive: z.boolean().optional(),
  equipment: z.array(z.string()).optional(),
  notes: z.string().optional(),
  displayOrder: z.number().optional(),
});

const roomAssignmentSchema = z.object({
  roomId: z.string().min(1),
  providerId: z.string().min(1),
  dayOfWeek: z.number().min(0).max(6),
  timeSlot: z.string().optional(),
});

// ============================================
// ROUTER SETUP
// ============================================

export const patientFlowRouter = Router();

// ============================================
// PATIENT FLOW ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/patient-flow/board:
 *   get:
 *     summary: Get room status board for a location
 *     description: Returns all rooms with their current patient status for the room board display
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Location ID to get room board for
 *     responses:
 *       200:
 *         description: Room status board data
 */
patientFlowRouter.get(
  '/board',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const { locationId } = req.query;

      if (!locationId || typeof locationId !== 'string') {
        return res.status(400).json({ error: 'locationId is required' });
      }

      const board = await patientFlowService.getRoomBoard(tenantId, locationId);
      res.json({ rooms: board });
    } catch (error) {
      logger.error('Error getting room board:', error);
      res.status(500).json({ error: 'Failed to get room board' });
    }
  }
);

/**
 * @swagger
 * /api/patient-flow/{appointmentId}/status:
 *   put:
 *     summary: Update patient flow status
 *     description: Update the status of a patient in the flow workflow
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [checked_in, rooming, vitals_complete, ready_for_provider, with_provider, checkout, completed]
 *               roomId:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated successfully
 */
patientFlowRouter.put(
  '/:appointmentId/status',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { appointmentId } = req.params;

      const validation = updateStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const { status, roomId, notes } = validation.data;

      const flow = await patientFlowService.updatePatientStatus(
        tenantId,
        appointmentId!,
        status as FlowStatus,
        { roomId, userId, notes }
      );

      // Audit log
      await auditLog(tenantId, userId, 'update_flow_status', 'patient_flow', flow.id);

      res.json({
        success: true,
        message: 'Status updated successfully',
        flow,
      });
    } catch (error) {
      logger.error('Error updating patient flow status:', error);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }
);

/**
 * @swagger
 * /api/patient-flow/provider/{providerId}/queue:
 *   get:
 *     summary: Get provider's patient queue
 *     description: Returns patients waiting for or currently with a specific provider
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Provider queue data
 */
patientFlowRouter.get(
  '/provider/:providerId/queue',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const { providerId } = req.params;

      const queue = await patientFlowService.getProviderQueue(tenantId, providerId!);
      res.json({ queue });
    } catch (error) {
      logger.error('Error getting provider queue:', error);
      res.status(500).json({ error: 'Failed to get provider queue' });
    }
  }
);

/**
 * @swagger
 * /api/patient-flow/wait-times:
 *   get:
 *     summary: Get current wait time statistics
 *     description: Returns average wait times by stage for a location
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *         description: Optional location ID to filter by
 *     responses:
 *       200:
 *         description: Wait time statistics
 */
patientFlowRouter.get(
  '/wait-times',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const locationId = req.query.locationId as string | undefined;

      const waitTimes = await patientFlowService.getWaitTimes(tenantId, locationId);
      res.json({ waitTimes });
    } catch (error) {
      logger.error('Error getting wait times:', error);
      res.status(500).json({ error: 'Failed to get wait times' });
    }
  }
);

/**
 * @swagger
 * /api/patient-flow/{appointmentId}/history:
 *   get:
 *     summary: Get flow history for an appointment
 *     description: Returns the complete status history for a patient flow
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Flow status history
 */
patientFlowRouter.get(
  '/:appointmentId/history',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const { appointmentId } = req.params;

      const history = await patientFlowService.getFlowHistory(tenantId, appointmentId!);
      res.json({ history });
    } catch (error) {
      logger.error('Error getting flow history:', error);
      res.status(500).json({ error: 'Failed to get flow history' });
    }
  }
);

/**
 * @swagger
 * /api/patient-flow/active:
 *   get:
 *     summary: Get all active patient flows for today
 *     description: Returns all patients currently in the flow (not completed)
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *         description: Optional location ID to filter by
 *     responses:
 *       200:
 *         description: Active patient flows
 */
patientFlowRouter.get(
  '/active',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const locationId = req.query.locationId as string | undefined;

      const flows = await patientFlowService.getActiveFlows(tenantId, locationId);
      res.json({ flows });
    } catch (error) {
      logger.error('Error getting active flows:', error);
      res.status(500).json({ error: 'Failed to get active flows' });
    }
  }
);

// ============================================
// ROOM MANAGEMENT ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/rooms:
 *   get:
 *     summary: Get all exam rooms
 *     description: Returns all exam rooms, optionally filtered by location
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *         description: Optional location ID to filter by
 *     responses:
 *       200:
 *         description: List of exam rooms
 */
patientFlowRouter.get(
  '/rooms',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const locationId = req.query.locationId as string | undefined;

      const rooms = await patientFlowService.getRooms(tenantId, locationId);
      res.json({ rooms });
    } catch (error) {
      logger.error('Error getting rooms:', error);
      res.status(500).json({ error: 'Failed to get rooms' });
    }
  }
);

/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Create a new exam room
 *     description: Creates a new exam room for a location
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomName
 *               - roomNumber
 *               - locationId
 *             properties:
 *               roomName:
 *                 type: string
 *               roomNumber:
 *                 type: string
 *               locationId:
 *                 type: string
 *               roomType:
 *                 type: string
 *                 enum: [exam, procedure, consult, triage]
 *               equipment:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *               displayOrder:
 *                 type: number
 *     responses:
 *       201:
 *         description: Room created successfully
 */
patientFlowRouter.post(
  '/rooms',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const validation = createRoomSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const room = await patientFlowService.createRoom(tenantId, validation.data);

      // Audit log
      await auditLog(tenantId, userId, 'create', 'exam_room', room.id);

      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        room,
      });
    } catch (error) {
      logger.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  }
);

/**
 * @swagger
 * /api/rooms/{roomId}:
 *   put:
 *     summary: Update an exam room
 *     description: Updates an existing exam room
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roomName:
 *                 type: string
 *               roomNumber:
 *                 type: string
 *               roomType:
 *                 type: string
 *                 enum: [exam, procedure, consult, triage]
 *               isActive:
 *                 type: boolean
 *               equipment:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *               displayOrder:
 *                 type: number
 *     responses:
 *       200:
 *         description: Room updated successfully
 */
patientFlowRouter.put(
  '/rooms/:roomId',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { roomId } = req.params;

      const validation = updateRoomSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const room = await patientFlowService.updateRoom(tenantId, roomId!, validation.data);

      // Audit log
      await auditLog(tenantId, userId, 'update', 'exam_room', room.id);

      res.json({
        success: true,
        message: 'Room updated successfully',
        room,
      });
    } catch (error) {
      logger.error('Error updating room:', error);
      res.status(500).json({ error: 'Failed to update room' });
    }
  }
);

// ============================================
// ROOM ASSIGNMENT ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/rooms/assignments:
 *   post:
 *     summary: Set room assignment for a provider
 *     description: Assigns a provider to a room for a specific day of the week
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *               - providerId
 *               - dayOfWeek
 *             properties:
 *               roomId:
 *                 type: string
 *               providerId:
 *                 type: string
 *               dayOfWeek:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 6
 *               timeSlot:
 *                 type: string
 *     responses:
 *       200:
 *         description: Assignment created successfully
 */
patientFlowRouter.post(
  '/rooms/assignments',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const validation = roomAssignmentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const { roomId, providerId, dayOfWeek, timeSlot } = validation.data;

      await patientFlowService.setRoomAssignment(tenantId, roomId, providerId, dayOfWeek, timeSlot);

      // Audit log
      await auditLog(tenantId, userId, 'create', 'room_assignment', roomId);

      res.json({
        success: true,
        message: 'Room assignment created successfully',
      });
    } catch (error) {
      logger.error('Error creating room assignment:', error);
      res.status(500).json({ error: 'Failed to create room assignment' });
    }
  }
);

/**
 * @swagger
 * /api/rooms/{roomId}/assignments/{dayOfWeek}:
 *   delete:
 *     summary: Remove room assignment
 *     description: Removes a provider assignment from a room for a specific day
 *     tags:
 *       - Patient Flow
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dayOfWeek
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 6
 *     responses:
 *       200:
 *         description: Assignment removed successfully
 */
patientFlowRouter.delete(
  '/rooms/:roomId/assignments/:dayOfWeek',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { roomId, dayOfWeek } = req.params;

      const day = parseInt(dayOfWeek!, 10);
      if (isNaN(day) || day < 0 || day > 6) {
        return res.status(400).json({ error: 'Invalid day of week' });
      }

      await patientFlowService.removeRoomAssignment(tenantId, roomId!, day);

      // Audit log
      await auditLog(tenantId, userId, 'delete', 'room_assignment', roomId!);

      res.json({
        success: true,
        message: 'Room assignment removed successfully',
      });
    } catch (error) {
      logger.error('Error removing room assignment:', error);
      res.status(500).json({ error: 'Failed to remove room assignment' });
    }
  }
);

// Also create a separate router for /api/rooms endpoints
export const roomsRouter = Router();

// Re-export room-specific endpoints on /api/rooms
roomsRouter.get(
  '/',
  requireAuth,
  requireRoles(['admin', 'front_desk', 'ma', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const locationId = req.query.locationId as string | undefined;

      const rooms = await patientFlowService.getRooms(tenantId, locationId);
      res.json({ rooms });
    } catch (error) {
      logger.error('Error getting rooms:', error);
      res.status(500).json({ error: 'Failed to get rooms' });
    }
  }
);

roomsRouter.post(
  '/',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const validation = createRoomSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const room = await patientFlowService.createRoom(tenantId, validation.data);

      await auditLog(tenantId, userId, 'create', 'exam_room', room.id);

      res.status(201).json({
        success: true,
        message: 'Room created successfully',
        room,
      });
    } catch (error) {
      logger.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  }
);

roomsRouter.put(
  '/:roomId',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const { roomId } = req.params;

      const validation = updateRoomSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: validation.error.issues,
        });
      }

      const room = await patientFlowService.updateRoom(tenantId, roomId!, validation.data);

      await auditLog(tenantId, userId, 'update', 'exam_room', room.id);

      res.json({
        success: true,
        message: 'Room updated successfully',
        room,
      });
    } catch (error) {
      logger.error('Error updating room:', error);
      res.status(500).json({ error: 'Failed to update room' });
    }
  }
);
