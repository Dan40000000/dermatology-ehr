/**
 * Staff Scheduling & Resource Management Routes
 *
 * API endpoints for:
 * - Staff schedule management
 * - Shift swap requests
 * - PTO requests and balances
 * - Room scheduling
 * - Credential tracking
 * - Training compliance
 * - Overtime alerts
 * - Productivity metrics
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';
import {
  staffSchedulingService,
  ShiftType,
  ScheduleStatus,
  SwapStatus,
  PTOType,
  PTOStatus,
  RoomType,
  RoomStatus,
  CredentialType,
} from '../services/staffSchedulingService';
import { logger } from '../lib/logger';

export const staffSchedulingRouter = Router();

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createScheduleSchema = z.object({
  staffId: z.string().uuid(),
  scheduleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  shiftType: z.nativeEnum(ShiftType).optional(),
  notes: z.string().optional(),
});

const swapRequestSchema = z.object({
  originalScheduleId: z.string().uuid(),
  targetStaffId: z.string().uuid(),
  reason: z.string().optional(),
});

const resolveSwapSchema = z.object({
  status: z.enum(['approved', 'denied']),
  adminNotes: z.string().optional(),
});

const ptoRequestSchema = z.object({
  requestType: z.nativeEnum(PTOType),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive(),
  reason: z.string().optional(),
});

const resolvePTOSchema = z.object({
  status: z.enum(['approved', 'denied']),
  adminNotes: z.string().optional(),
});

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  roomType: z.nativeEnum(RoomType),
  capacity: z.number().int().positive().optional(),
  equipment: z.array(z.string()).optional(),
  locationId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const reserveRoomSchema = z.object({
  roomId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  appointmentId: z.string().uuid().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
});

const createCredentialSchema = z.object({
  staffId: z.string().uuid(),
  credentialType: z.nativeEnum(CredentialType),
  credentialNumber: z.string().optional(),
  issuingAuthority: z.string().optional(),
  issuingState: z.string().max(2).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  documentUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

const createTrainingRequirementSchema = z.object({
  role: z.string(),
  trainingName: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  frequencyMonths: z.number().int().positive().optional(),
  category: z.string().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
});

const recordTrainingCompletionSchema = z.object({
  staffId: z.string().uuid(),
  trainingId: z.string().uuid(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  score: z.number().int().min(0).max(100).optional(),
  certificateUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// =====================================================
// STAFF SCHEDULE ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/staff:
 *   get:
 *     summary: List staff schedules
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [scheduled, confirmed, completed, cancelled]
 *     responses:
 *       200:
 *         description: List of staff schedules
 */
staffSchedulingRouter.get('/staff', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, startDate, endDate, status } = req.query;

    const schedules = await staffSchedulingService.getSchedules(tenantId, {
      staffId: staffId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as ScheduleStatus,
    });

    res.json({ schedules });
  } catch (error: any) {
    logger.error('Error fetching staff schedules', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/staff:
 *   post:
 *     summary: Create a staff schedule
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId, scheduleDate, startTime, endTime]
 *             properties:
 *               staffId:
 *                 type: string
 *                 format: uuid
 *               scheduleDate:
 *                 type: string
 *                 format: date
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *               shiftType:
 *                 type: string
 *                 enum: [regular, on_call, overtime, split]
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Schedule created
 */
staffSchedulingRouter.post(
  '/staff',
  requireAuth,
  requireRoles(['admin', 'manager', 'scheduler']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = createScheduleSchema.parse(req.body);

      const schedule = await staffSchedulingService.createSchedule(
        tenantId,
        parsed.staffId,
        parsed.scheduleDate,
        parsed.startTime,
        parsed.endTime,
        parsed.shiftType,
        parsed.notes,
        userId
      );

      await auditLog(tenantId, userId, 'staff_schedule.create', 'staff_schedules', schedule.id);

      res.status(201).json({ schedule });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error creating staff schedule', { error: error.message });
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  }
);

// =====================================================
// SHIFT SWAP ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/swap-request:
 *   post:
 *     summary: Request a shift swap
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post('/swap-request', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.tenantId!;
    const parsed = swapRequestSchema.parse(req.body);

    const swapRequest = await staffSchedulingService.requestShiftSwap(
      parsed.originalScheduleId,
      userId,
      parsed.targetStaffId,
      parsed.reason
    );

    await auditLog(tenantId, userId, 'shift_swap.request', 'shift_swap_requests', swapRequest.id);

    res.status(201).json({ swapRequest });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error creating swap request', { error: error.message });
    res.status(500).json({ error: 'Failed to create swap request' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/swap-request/{id}:
 *   patch:
 *     summary: Approve or deny a shift swap request
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.patch(
  '/swap-request/:id',
  requireAuth,
  requireRoles(['admin', 'manager', 'scheduler']),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params.id as string;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = resolveSwapSchema.parse(req.body);

      const swapRequest = await staffSchedulingService.resolveShiftSwap(
        id,
        parsed.status as SwapStatus.APPROVED | SwapStatus.DENIED,
        userId,
        parsed.adminNotes
      );

      if (!swapRequest) {
        return res.status(404).json({ error: 'Swap request not found' });
      }

      await auditLog(tenantId, userId, `shift_swap.${parsed.status}`, 'shift_swap_requests', id);

      res.json({ swapRequest });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error resolving swap request', { error: error.message });
      res.status(500).json({ error: 'Failed to resolve swap request' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/swap-requests:
 *   get:
 *     summary: List shift swap requests
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/swap-requests', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, status } = req.query;

    const swapRequests = await staffSchedulingService.getShiftSwapRequests(tenantId, {
      staffId: staffId as string,
      status: status as SwapStatus,
    });

    res.json({ swapRequests });
  } catch (error: any) {
    logger.error('Error fetching swap requests', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch swap requests' });
  }
});

// =====================================================
// PTO ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/pto:
 *   post:
 *     summary: Request PTO
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post('/pto', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;
    const parsed = ptoRequestSchema.parse(req.body);

    const ptoRequest = await staffSchedulingService.requestPTO(
      tenantId,
      userId,
      parsed.requestType,
      parsed.startDate,
      parsed.endDate,
      parsed.hours,
      parsed.reason
    );

    await auditLog(tenantId, userId, 'pto.request', 'pto_requests', ptoRequest.id);

    res.status(201).json({ ptoRequest });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    logger.error('Error creating PTO request', { error: error.message });
    res.status(500).json({ error: 'Failed to create PTO request' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/pto/{staffId}:
 *   get:
 *     summary: Get PTO requests and balance for a staff member
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/pto/:staffId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const staffId = req.params.staffId as string;
    const { status, year } = req.query;

    const [requests, balance] = await Promise.all([
      staffSchedulingService.getPTORequests(tenantId, {
        staffId,
        status: status as PTOStatus,
      }),
      staffSchedulingService.getPTOBalance(tenantId, staffId, year ? parseInt(year as string) : undefined),
    ]);

    res.json({ requests, balance });
  } catch (error: any) {
    logger.error('Error fetching PTO data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch PTO data' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/pto/{id}:
 *   patch:
 *     summary: Approve or deny a PTO request
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.patch(
  '/pto/:id',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params.id as string;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = resolvePTOSchema.parse(req.body);

      const ptoRequest = await staffSchedulingService.resolvePTORequest(
        id,
        parsed.status as PTOStatus.APPROVED | PTOStatus.DENIED,
        userId,
        parsed.adminNotes
      );

      if (!ptoRequest) {
        return res.status(404).json({ error: 'PTO request not found' });
      }

      await auditLog(tenantId, userId, `pto.${parsed.status}`, 'pto_requests', id);

      res.json({ ptoRequest });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error resolving PTO request', { error: error.message });
      res.status(500).json({ error: 'Failed to resolve PTO request' });
    }
  }
);

// =====================================================
// ROOM ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/rooms:
 *   get:
 *     summary: List rooms
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/rooms', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { roomType, status, locationId } = req.query;

    const rooms = await staffSchedulingService.getRooms(tenantId, {
      roomType: roomType as RoomType,
      status: status as RoomStatus,
      locationId: locationId as string,
    });

    res.json({ rooms });
  } catch (error: any) {
    logger.error('Error fetching rooms', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/rooms:
 *   post:
 *     summary: Create a room
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/rooms',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = createRoomSchema.parse(req.body);

      const room = await staffSchedulingService.createRoom(tenantId, parsed.name, parsed.roomType, {
        capacity: parsed.capacity,
        equipment: parsed.equipment,
        locationId: parsed.locationId,
        notes: parsed.notes,
      });

      await auditLog(tenantId, userId, 'room.create', 'rooms', room.id);

      res.status(201).json({ room });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error creating room', { error: error.message });
      res.status(500).json({ error: 'Failed to create room' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/rooms/reserve:
 *   post:
 *     summary: Reserve a room
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post('/rooms/reserve', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;
    const parsed = reserveRoomSchema.parse(req.body);

    const reservation = await staffSchedulingService.scheduleRoom(parsed.roomId, parsed.startTime, parsed.endTime, {
      appointmentId: parsed.appointmentId,
      reservedBy: userId,
      purpose: parsed.purpose,
      notes: parsed.notes,
    });

    await auditLog(tenantId, userId, 'room.reserve', 'room_schedules', reservation.id);

    res.status(201).json({ reservation });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error.message?.includes('conflicting')) {
      return res.status(409).json({ error: 'Room is already booked for this time slot' });
    }
    logger.error('Error reserving room', { error: error.message });
    res.status(500).json({ error: 'Failed to reserve room' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/rooms/availability:
 *   get:
 *     summary: Check room availability
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/rooms/availability', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { startTime, endTime, roomType, locationId, requiredEquipment } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const availableRooms = await staffSchedulingService.checkRoomAvailability(
      tenantId,
      startTime as string,
      endTime as string,
      {
        roomType: roomType as RoomType,
        locationId: locationId as string,
        requiredEquipment: requiredEquipment ? (requiredEquipment as string).split(',') : undefined,
      }
    );

    res.json({ availableRooms });
  } catch (error: any) {
    logger.error('Error checking room availability', { error: error.message });
    res.status(500).json({ error: 'Failed to check room availability' });
  }
});

// =====================================================
// CREDENTIAL ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/credentials:
 *   get:
 *     summary: List staff credentials
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/credentials', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, credentialType, verified } = req.query;

    const credentials = await staffSchedulingService.getCredentials(tenantId, {
      staffId: staffId as string,
      credentialType: credentialType as CredentialType,
      verified: verified !== undefined ? verified === 'true' : undefined,
    });

    res.json({ credentials });
  } catch (error: any) {
    logger.error('Error fetching credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch credentials' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/credentials:
 *   post:
 *     summary: Add a staff credential
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/credentials',
  requireAuth,
  requireRoles(['admin', 'manager', 'hr']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = createCredentialSchema.parse(req.body);

      const credential = await staffSchedulingService.trackCredential(tenantId, parsed.staffId, parsed.credentialType, {
        credentialNumber: parsed.credentialNumber,
        issuingAuthority: parsed.issuingAuthority,
        issuingState: parsed.issuingState,
        issueDate: parsed.issueDate,
        expirationDate: parsed.expirationDate,
        documentUrl: parsed.documentUrl,
        notes: parsed.notes,
      });

      await auditLog(tenantId, userId, 'credential.create', 'staff_credentials', credential.id);

      res.status(201).json({ credential });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error creating credential', { error: error.message });
      res.status(500).json({ error: 'Failed to create credential' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/credentials/{id}/verify:
 *   post:
 *     summary: Verify a credential
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/credentials/:id/verify',
  requireAuth,
  requireRoles(['admin', 'manager', 'hr']),
  async (req: AuthedRequest, res) => {
    try {
      const id = req.params.id as string;
      const tenantId = req.tenantId!;
      const userId = req.user!.id;

      const credential = await staffSchedulingService.verifyCredential(id, userId);

      if (!credential) {
        return res.status(404).json({ error: 'Credential not found' });
      }

      await auditLog(tenantId, userId, 'credential.verify', 'staff_credentials', id);

      res.json({ credential });
    } catch (error: any) {
      logger.error('Error verifying credential', { error: error.message });
      res.status(500).json({ error: 'Failed to verify credential' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/credentials/expiring:
 *   get:
 *     summary: Get credentials expiring soon
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/credentials/expiring', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { days } = req.query;

    const expiringCredentials = await staffSchedulingService.alertExpiringCredentials(
      tenantId,
      days ? parseInt(days as string) : 30
    );

    res.json({ credentials: expiringCredentials });
  } catch (error: any) {
    logger.error('Error fetching expiring credentials', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch expiring credentials' });
  }
});

// =====================================================
// TRAINING ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/training:
 *   get:
 *     summary: Get training compliance status
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/training', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, role } = req.query;

    const [requirements, compliance] = await Promise.all([
      staffSchedulingService.getTrainingRequirements(tenantId, role as string),
      staffSchedulingService.trackTrainingCompliance(tenantId, staffId as string),
    ]);

    res.json({ requirements, compliance });
  } catch (error: any) {
    logger.error('Error fetching training data', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch training data' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/training/requirements:
 *   post:
 *     summary: Create a training requirement
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/training/requirements',
  requireAuth,
  requireRoles(['admin', 'manager', 'hr']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = createTrainingRequirementSchema.parse(req.body);

      const requirement = await staffSchedulingService.createTrainingRequirement(
        tenantId,
        parsed.role,
        parsed.trainingName,
        {
          description: parsed.description,
          required: parsed.required,
          frequencyMonths: parsed.frequencyMonths,
          category: parsed.category,
          passingScore: parsed.passingScore,
        }
      );

      await auditLog(tenantId, userId, 'training.requirement.create', 'training_requirements', requirement.id);

      res.status(201).json({ requirement });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error creating training requirement', { error: error.message });
      res.status(500).json({ error: 'Failed to create training requirement' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/training/complete:
 *   post:
 *     summary: Record training completion
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/training/complete',
  requireAuth,
  requireRoles(['admin', 'manager', 'hr']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const userId = req.user!.id;
      const parsed = recordTrainingCompletionSchema.parse(req.body);

      const record = await staffSchedulingService.recordTrainingCompletion(
        parsed.staffId,
        parsed.trainingId,
        parsed.completedDate,
        {
          expirationDate: parsed.expirationDate,
          score: parsed.score,
          certificateUrl: parsed.certificateUrl,
          notes: parsed.notes,
        }
      );

      await auditLog(tenantId, userId, 'training.complete', 'staff_training_records', record.id);

      res.status(201).json({ record });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      logger.error('Error recording training completion', { error: error.message });
      res.status(500).json({ error: 'Failed to record training completion' });
    }
  }
);

// =====================================================
// OVERTIME ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/overtime-alerts:
 *   get:
 *     summary: Get overtime risk alerts
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/overtime-alerts', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, acknowledged } = req.query;

    const alerts = await staffSchedulingService.getOvertimeAlerts(tenantId, {
      staffId: staffId as string,
      acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
    });

    res.json({ alerts });
  } catch (error: any) {
    logger.error('Error fetching overtime alerts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch overtime alerts' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/overtime-check:
 *   post:
 *     summary: Run overtime risk check
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/overtime-check',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const { threshold, warningThreshold } = req.body;

      const alerts = await staffSchedulingService.checkOvertimeRisk(
        tenantId,
        threshold || 40,
        warningThreshold || 36
      );

      res.json({ alerts, count: alerts.length });
    } catch (error: any) {
      logger.error('Error running overtime check', { error: error.message });
      res.status(500).json({ error: 'Failed to run overtime check' });
    }
  }
);

// =====================================================
// PRODUCTIVITY ROUTES
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/productivity:
 *   get:
 *     summary: Get productivity metrics
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/productivity', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const { staffId, startDate, endDate } = req.query;

    const metrics = await staffSchedulingService.getProductivityMetrics(tenantId, {
      staffId: staffId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json({ metrics });
  } catch (error: any) {
    logger.error('Error fetching productivity metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch productivity metrics' });
  }
});

/**
 * @swagger
 * /api/staff-scheduling/productivity/calculate:
 *   post:
 *     summary: Calculate productivity metrics for a date
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/productivity/calculate',
  requireAuth,
  requireRoles(['admin', 'manager']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;
      const { staffId, metricDate } = req.body;

      if (!staffId || !metricDate) {
        return res.status(400).json({ error: 'staffId and metricDate are required' });
      }

      const metrics = await staffSchedulingService.calculateProductivityMetrics(tenantId, staffId, metricDate);

      res.json({ metrics });
    } catch (error: any) {
      logger.error('Error calculating productivity metrics', { error: error.message });
      res.status(500).json({ error: 'Failed to calculate productivity metrics' });
    }
  }
);

// =====================================================
// DASHBOARD ROUTE
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/dashboard:
 *   get:
 *     summary: Get scheduling dashboard overview
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.get('/dashboard', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.tenantId!;

    const dashboard = await staffSchedulingService.getSchedulingDashboard(tenantId);

    res.json({ dashboard });
  } catch (error: any) {
    logger.error('Error fetching scheduling dashboard', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch scheduling dashboard' });
  }
});

// =====================================================
// AUTOMATION ROUTES (for cron jobs)
// =====================================================

/**
 * @swagger
 * /api/staff-scheduling/automation/credential-check:
 *   post:
 *     summary: Run daily credential expiration check (for automation)
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/automation/credential-check',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;

      await staffSchedulingService.runDailyCredentialCheck(tenantId);

      res.json({ success: true, message: 'Credential check completed' });
    } catch (error: any) {
      logger.error('Error running credential check', { error: error.message });
      res.status(500).json({ error: 'Failed to run credential check' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/automation/overtime-check:
 *   post:
 *     summary: Run weekly overtime risk check (for automation)
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/automation/overtime-check',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;

      await staffSchedulingService.runWeeklyOvertimeCheck(tenantId);

      res.json({ success: true, message: 'Overtime check completed' });
    } catch (error: any) {
      logger.error('Error running overtime check', { error: error.message });
      res.status(500).json({ error: 'Failed to run overtime check' });
    }
  }
);

/**
 * @swagger
 * /api/staff-scheduling/automation/training-report:
 *   post:
 *     summary: Run monthly training compliance report (for automation)
 *     tags: [Staff Scheduling]
 *     security:
 *       - bearerAuth: []
 */
staffSchedulingRouter.post(
  '/automation/training-report',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.tenantId!;

      const report = await staffSchedulingService.runMonthlyTrainingReport(tenantId);

      res.json({ success: true, report });
    } catch (error: any) {
      logger.error('Error running training report', { error: error.message });
      res.status(500).json({ error: 'Failed to run training report' });
    }
  }
);
