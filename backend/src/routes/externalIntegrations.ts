/**
 * External Integrations API Routes
 *
 * Comprehensive API for managing external integrations:
 * - Integration configuration and status
 * - Clearinghouse / ERA processing
 * - Insurance eligibility verification
 * - E-Prescribing
 * - Lab orders and results
 * - Payment processing
 * - Fax management
 */

import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';
import {
  IntegrationService,
  getIntegrationService,
  IntegrationType,
} from '../services/integrationService';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const integrationTypeSchema = z.enum([
  'clearinghouse', 'eligibility', 'eprescribe', 'lab', 'payment', 'fax',
]);

const configureIntegrationSchema = z.object({
  provider: z.string().min(1),
  config: z.record(z.string(), z.any()),
  credentials: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
  syncFrequencyMinutes: z.number().int().min(5).max(1440).optional(),
});

const submitClaimSchema = z.object({
  claimId: z.string().uuid(),
  batchId: z.string().optional(),
});

const batchSubmitClaimsSchema = z.object({
  claimIds: z.array(z.string().uuid()).min(1).max(500),
});

const eligibilityCheckSchema = z.object({
  patientId: z.string().uuid(),
  payerId: z.string().optional(),
  memberId: z.string().optional(),
  serviceDate: z.string().optional(),
});

const batchEligibilitySchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1).max(100),
});

const sendPrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  medication: z.object({
    name: z.string(),
    ndc: z.string().optional(),
    strength: z.string(),
    dosageForm: z.string(),
    quantity: z.number().positive(),
    quantityUnit: z.string(),
    daysSupply: z.number().int().positive(),
    refills: z.number().int().min(0),
    dispenseAsWritten: z.boolean(),
  }),
  sig: z.string(),
  notes: z.string().optional(),
  pharmacy: z.object({
    ncpdpId: z.string(),
    name: z.string(),
    phone: z.string().optional(),
  }),
  isControlled: z.boolean().optional(),
  controlledSchedule: z.string().optional(),
});

const cancelPrescriptionSchema = z.object({
  prescriptionId: z.string().uuid(),
  reason: z.string().min(1),
});

const labOrderSchema = z.object({
  patientId: z.string().uuid(),
  providerId: z.string().uuid(),
  encounterId: z.string().uuid().optional(),
  labProvider: z.string(),
  tests: z.array(z.object({
    code: z.string(),
    name: z.string(),
    loincCode: z.string().optional(),
    instructions: z.string().optional(),
  })).min(1),
  diagnosisCodes: z.array(z.string()),
  priority: z.enum(['stat', 'urgent', 'routine']).default('routine'),
  fastingRequired: z.boolean().default(false),
  specialInstructions: z.string().optional(),
});

const paymentIntentSchema = z.object({
  amountCents: z.number().int().positive(),
  patientId: z.string().uuid(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const processPaymentSchema = z.object({
  paymentIntentId: z.string(),
  paymentMethodId: z.string(),
});

const refundPaymentSchema = z.object({
  paymentIntentId: z.string(),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

const sendFaxSchema = z.object({
  toNumber: z.string().min(10),
  document: z.object({
    type: z.enum(['url', 'base64', 'documentId']),
    content: z.string(),
    filename: z.string().optional(),
  }),
  subject: z.string().optional(),
  referralId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
  priority: z.enum(['normal', 'high']).optional(),
});

// ============================================================================
// INTEGRATION CONFIGURATION ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations:
 *   get:
 *     summary: Get status of all integrations
 *     tags: [External Integrations]
 */
router.get('/', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const service = getIntegrationService(req.user!.tenantId);
    const status = await service.getIntegrationStatus();
    res.json({ integrations: status });
  } catch (error: any) {
    logger.error('Failed to get integration status', { error: error.message });
    res.status(500).json({ error: 'Failed to get integration status' });
  }
});

/**
 * @swagger
 * /api/external-integrations/{type}:
 *   get:
 *     summary: Get detailed status of specific integration
 *     tags: [External Integrations]
 */
router.get('/:type', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const type = integrationTypeSchema.parse(req.params.type);
    const service = getIntegrationService(req.user!.tenantId);
    const status = await service.getIntegrationTypeStatus(type);
    res.json({ integration: status });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid integration type' });
    }
    logger.error('Failed to get integration status', { error: error.message });
    res.status(500).json({ error: 'Failed to get integration status' });
  }
});

/**
 * @swagger
 * /api/external-integrations/{type}:
 *   patch:
 *     summary: Configure an integration
 *     tags: [External Integrations]
 */
router.patch('/:type', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const type = integrationTypeSchema.parse(req.params.type);
    const data = configureIntegrationSchema.parse(req.body);

    const service = getIntegrationService(req.user!.tenantId);
    const result = await service.configureIntegration(type, data);

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'integration.configured',
      'integration',
      result.configId
    );

    res.json({ success: true, configId: result.configId });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to configure integration', { error: error.message });
    res.status(500).json({ error: 'Failed to configure integration' });
  }
});

/**
 * @swagger
 * /api/external-integrations/{type}/test:
 *   post:
 *     summary: Test integration connection
 *     tags: [External Integrations]
 */
router.post('/:type/test', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const type = integrationTypeSchema.parse(req.params.type);
    const service = getIntegrationService(req.user!.tenantId);
    const result = await service.testConnection(type);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid integration type' });
    }
    logger.error('Failed to test integration', { error: error.message });
    res.status(500).json({ error: 'Failed to test integration' });
  }
});

/**
 * @swagger
 * /api/external-integrations/{type}/sync:
 *   post:
 *     summary: Trigger manual sync for integration
 *     tags: [External Integrations]
 */
router.post('/:type/sync', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const type = integrationTypeSchema.parse(req.params.type);
    const service = getIntegrationService(req.user!.tenantId);
    const result = await service.syncIntegration(type);

    await auditLog(
      req.user!.tenantId,
      req.user!.id,
      'integration.synced',
      'integration',
      type
    );

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid integration type' });
    }
    logger.error('Failed to sync integration', { error: error.message });
    res.status(500).json({ error: 'Failed to sync integration' });
  }
});

/**
 * @swagger
 * /api/external-integrations/logs:
 *   get:
 *     summary: Get integration logs
 *     tags: [External Integrations]
 */
router.get('/logs', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const service = getIntegrationService(req.user!.tenantId);
    const { type, status, limit, offset, startDate, endDate } = req.query;

    const result = await service.getIntegrationLogs(
      type as IntegrationType | undefined,
      {
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
        status: status as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      }
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to get integration logs', { error: error.message });
    res.status(500).json({ error: 'Failed to get integration logs' });
  }
});

/**
 * @swagger
 * /api/external-integrations/stats:
 *   get:
 *     summary: Get integration statistics
 *     tags: [External Integrations]
 */
router.get('/stats', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const service = getIntegrationService(req.user!.tenantId);
    const { type, days } = req.query;

    const stats = await service.getIntegrationStats(
      type as IntegrationType | undefined,
      days ? parseInt(days as string, 10) : 7
    );

    res.json({ stats });
  } catch (error: any) {
    logger.error('Failed to get integration stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get integration stats' });
  }
});

// ============================================================================
// CLEARINGHOUSE ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/clearinghouse/submit:
 *   post:
 *     summary: Submit a claim to clearinghouse
 *     tags: [Clearinghouse]
 */
router.post('/clearinghouse/submit', requireAuth, requireRoles(['admin', 'front_desk']), async (req: AuthedRequest, res) => {
  try {
    const { claimId, batchId } = submitClaimSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    // Get claim details
    const claimResult = await pool.query(
      `SELECT c.*, p.first_name, p.last_name, p.dob,
              ins.payer_id, ins.name as payer_name
       FROM claims c
       JOIN patients p ON p.id = c.patient_id
       LEFT JOIN insurance_payers ins ON ins.id = c.payer_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [claimId, tenantId]
    );

    if (claimResult.rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim = claimResult.rows[0];
    const service = getIntegrationService(tenantId);
    const adapter = await service.getClearinghouseAdapter();

    const result = await adapter.submitClaim({
      claimId: claim.id,
      claimNumber: claim.claim_number,
      patientId: claim.patient_id,
      patientName: `${claim.last_name}, ${claim.first_name}`,
      payerId: claim.payer_id || 'UNKNOWN',
      payerName: claim.payer_name || 'Unknown',
      totalCents: claim.total_cents,
      serviceDate: claim.service_date,
      diagnosisCodes: claim.diagnosis_codes || [],
      procedureCodes: claim.procedure_codes || [],
      providerId: claim.provider_id,
      providerNpi: claim.provider_npi || '',
    });

    await auditLog(tenantId, userId, 'claim.submitted_to_clearinghouse', 'claim', claimId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to submit claim', { error: error.message });
    res.status(500).json({ error: 'Failed to submit claim' });
  }
});

/**
 * @swagger
 * /api/external-integrations/clearinghouse/batch:
 *   post:
 *     summary: Submit batch of claims
 *     tags: [Clearinghouse]
 */
router.post('/clearinghouse/batch', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const { claimIds } = batchSubmitClaimsSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    // Get all claims
    const claimsResult = await pool.query(
      `SELECT c.*, p.first_name, p.last_name, p.dob,
              ins.payer_id, ins.name as payer_name
       FROM claims c
       JOIN patients p ON p.id = c.patient_id
       LEFT JOIN insurance_payers ins ON ins.id = c.payer_id
       WHERE c.id = ANY($1) AND c.tenant_id = $2`,
      [claimIds, tenantId]
    );

    const claims = claimsResult.rows.map(claim => ({
      claimId: claim.id,
      claimNumber: claim.claim_number,
      patientId: claim.patient_id,
      patientName: `${claim.last_name}, ${claim.first_name}`,
      payerId: claim.payer_id || 'UNKNOWN',
      payerName: claim.payer_name || 'Unknown',
      totalCents: claim.total_cents,
      serviceDate: claim.service_date,
      diagnosisCodes: claim.diagnosis_codes || [],
      procedureCodes: claim.procedure_codes || [],
      providerId: claim.provider_id,
      providerNpi: claim.provider_npi || '',
    }));

    const service = getIntegrationService(tenantId);
    const adapter = await service.getClearinghouseAdapter();
    const result = await adapter.submitBatch(claims);

    await auditLog(tenantId, userId, 'claims.batch_submitted', 'claim', result.batchId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to submit batch', { error: error.message });
    res.status(500).json({ error: 'Failed to submit batch' });
  }
});

/**
 * @swagger
 * /api/external-integrations/clearinghouse/status/{claimId}:
 *   get:
 *     summary: Check claim status
 *     tags: [Clearinghouse]
 */
router.get('/clearinghouse/status/:claimId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { claimId } = req.params;
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getClearinghouseAdapter();
    const status = await adapter.checkClaimStatus(claimId!);
    res.json(status);
  } catch (error: any) {
    logger.error('Failed to get claim status', { error: error.message });
    res.status(500).json({ error: 'Failed to get claim status' });
  }
});

/**
 * @swagger
 * /api/external-integrations/clearinghouse/era:
 *   get:
 *     summary: Get ERA files
 *     tags: [Clearinghouse]
 */
router.get('/clearinghouse/era', requireAuth, requireRoles(['admin', 'front_desk']), async (req: AuthedRequest, res) => {
  try {
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getClearinghouseAdapter();
    const files = await adapter.getERAFiles();
    res.json({ eraFiles: files });
  } catch (error: any) {
    logger.error('Failed to get ERA files', { error: error.message });
    res.status(500).json({ error: 'Failed to get ERA files' });
  }
});

/**
 * @swagger
 * /api/external-integrations/clearinghouse/era/{id}/process:
 *   post:
 *     summary: Process ERA file
 *     tags: [Clearinghouse]
 */
router.post('/clearinghouse/era/:id/process', requireAuth, requireRoles(['admin', 'front_desk']), async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getClearinghouseAdapter();
    const result = await adapter.processERA(id!);

    await auditLog(tenantId, userId, 'era.processed', 'era_file', id!);

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to process ERA', { error: error.message });
    res.status(500).json({ error: 'Failed to process ERA' });
  }
});

// ============================================================================
// ELIGIBILITY ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/eligibility/check:
 *   post:
 *     summary: Check patient eligibility
 *     tags: [Eligibility]
 */
router.post('/eligibility/check', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = eligibilityCheckSchema.parse(req.body);
    const { tenantId } = req.user!;

    // Get patient details
    const patientResult = await pool.query(
      `SELECT id, first_name, last_name, dob, insurance_payer_id, insurance_member_id
       FROM patients WHERE id = $1 AND tenant_id = $2`,
      [data.patientId, tenantId]
    );

    if (patientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const patient = patientResult.rows[0];
    const service = getIntegrationService(tenantId);
    const adapter = await service.getEligibilityAdapter();

    const result = await adapter.checkEligibility({
      patientId: patient.id,
      payerId: data.payerId || patient.insurance_payer_id || 'UNKNOWN',
      memberId: data.memberId || patient.insurance_member_id || '',
      patientFirstName: patient.first_name,
      patientLastName: patient.last_name,
      patientDob: patient.dob?.toISOString().split('T')[0] || '',
      serviceDate: data.serviceDate,
    });

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to check eligibility', { error: error.message });
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

/**
 * @swagger
 * /api/external-integrations/eligibility/{patientId}:
 *   get:
 *     summary: Get cached eligibility for patient
 *     tags: [Eligibility]
 */
router.get('/eligibility/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getEligibilityAdapter();
    const coverage = await adapter.getCoverageDetails(patientId!);

    if (!coverage) {
      return res.status(404).json({ error: 'No eligibility data found' });
    }

    res.json(coverage);
  } catch (error: any) {
    logger.error('Failed to get eligibility', { error: error.message });
    res.status(500).json({ error: 'Failed to get eligibility' });
  }
});

// ============================================================================
// E-PRESCRIBE ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/erx/send:
 *   post:
 *     summary: Send prescription to pharmacy
 *     tags: [E-Prescribe]
 */
router.post('/erx/send', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const data = sendPrescriptionSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getEPrescribeAdapter();

    const result = await adapter.sendPrescription({
      patientId: data.patientId,
      providerId: data.providerId,
      encounterId: data.encounterId,
      medication: data.medication,
      sig: data.sig,
      notes: data.notes,
      pharmacy: data.pharmacy,
      isControlled: data.isControlled,
      controlledSchedule: data.controlledSchedule,
    });

    await auditLog(tenantId, userId, 'prescription.sent', 'prescription', result.prescriptionId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to send prescription', { error: error.message });
    res.status(500).json({ error: 'Failed to send prescription' });
  }
});

/**
 * @swagger
 * /api/external-integrations/erx/cancel:
 *   post:
 *     summary: Cancel prescription
 *     tags: [E-Prescribe]
 */
router.post('/erx/cancel', requireAuth, requireRoles(['provider', 'admin']), async (req: AuthedRequest, res) => {
  try {
    const { prescriptionId, reason } = cancelPrescriptionSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getEPrescribeAdapter();
    const result = await adapter.cancelPrescription(prescriptionId, reason);

    await auditLog(tenantId, userId, 'prescription.cancelled', 'prescription', prescriptionId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to cancel prescription', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel prescription' });
  }
});

/**
 * @swagger
 * /api/external-integrations/erx/pharmacies:
 *   get:
 *     summary: Search pharmacies
 *     tags: [E-Prescribe]
 */
router.get('/erx/pharmacies', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { zip, limit } = req.query;

    if (!zip) {
      return res.status(400).json({ error: 'ZIP code is required' });
    }

    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getEPrescribeAdapter();
    const pharmacies = await adapter.getPharmacyDirectory(
      zip as string,
      { limit: limit ? parseInt(limit as string, 10) : 20 }
    );

    res.json({ pharmacies });
  } catch (error: any) {
    logger.error('Failed to search pharmacies', { error: error.message });
    res.status(500).json({ error: 'Failed to search pharmacies' });
  }
});

/**
 * @swagger
 * /api/external-integrations/erx/history/{patientId}:
 *   get:
 *     summary: Get medication history
 *     tags: [E-Prescribe]
 */
router.get('/erx/history/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getEPrescribeAdapter();
    const history = await adapter.getMedicationHistory(patientId!);
    res.json(history);
  } catch (error: any) {
    logger.error('Failed to get medication history', { error: error.message });
    res.status(500).json({ error: 'Failed to get medication history' });
  }
});

// ============================================================================
// LAB ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/labs/order:
 *   post:
 *     summary: Create lab order
 *     tags: [Labs]
 */
router.post('/labs/order', requireAuth, requireRoles(['provider', 'admin', 'ma']), async (req: AuthedRequest, res) => {
  try {
    const data = labOrderSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getLabAdapter();
    const result = await adapter.createLabOrder(data);

    await auditLog(tenantId, userId, 'lab_order.created', 'lab_order', result.orderId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to create lab order', { error: error.message });
    res.status(500).json({ error: 'Failed to create lab order' });
  }
});

/**
 * @swagger
 * /api/external-integrations/labs/orders:
 *   get:
 *     summary: List lab orders
 *     tags: [Labs]
 */
router.get('/labs/orders', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId, status, limit, offset } = req.query;

    let query = `
      SELECT lo.*, p.first_name, p.last_name
      FROM lab_orders lo
      JOIN patients p ON p.id = lo.patient_id
      WHERE lo.tenant_id = $1
    `;
    const params: any[] = [req.user!.tenantId];
    let paramIndex = 2;

    if (patientId) {
      query += ` AND lo.patient_id = $${paramIndex}`;
      params.push(patientId);
      paramIndex++;
    }

    if (status) {
      query += ` AND lo.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY lo.ordered_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string, 10) || 50, parseInt(offset as string, 10) || 0);

    const result = await pool.query(query, params);
    res.json({ orders: result.rows });
  } catch (error: any) {
    logger.error('Failed to list lab orders', { error: error.message });
    res.status(500).json({ error: 'Failed to list lab orders' });
  }
});

/**
 * @swagger
 * /api/external-integrations/labs/results/{patientId}:
 *   get:
 *     summary: Get lab results for patient
 *     tags: [Labs]
 */
router.get('/labs/results/:patientId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { patientId } = req.params;

    const result = await pool.query(
      `SELECT lr.*, lo.order_number, lo.lab_provider
       FROM lab_results lr
       JOIN lab_orders lo ON lo.id = lr.order_id
       WHERE lo.patient_id = $1 AND lo.tenant_id = $2
       ORDER BY lr.resulted_at DESC
       LIMIT 100`,
      [patientId, req.user!.tenantId]
    );

    res.json({ results: result.rows });
  } catch (error: any) {
    logger.error('Failed to get lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to get lab results' });
  }
});

/**
 * @swagger
 * /api/external-integrations/labs/receive:
 *   post:
 *     summary: Poll for lab results
 *     tags: [Labs]
 */
router.post('/labs/receive', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const { labProvider } = req.body;
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getLabAdapter();
    const results = await adapter.receiveResults(labProvider);
    res.json(results);
  } catch (error: any) {
    logger.error('Failed to receive lab results', { error: error.message });
    res.status(500).json({ error: 'Failed to receive lab results' });
  }
});

// ============================================================================
// PAYMENT ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/payments/intent:
 *   post:
 *     summary: Create payment intent
 *     tags: [Payments]
 */
router.post('/payments/intent', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { amountCents, patientId, metadata } = paymentIntentSchema.parse(req.body);
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getPaymentAdapter();
    const intent = await adapter.createPaymentIntent(amountCents, patientId, metadata as Record<string, string> | undefined);
    res.json(intent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to create payment intent', { error: error.message });
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

/**
 * @swagger
 * /api/external-integrations/payments/process:
 *   post:
 *     summary: Process payment
 *     tags: [Payments]
 */
router.post('/payments/process', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = processPaymentSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getPaymentAdapter();
    const result = await adapter.processPayment(paymentIntentId, paymentMethodId);

    if (result.success) {
      await auditLog(tenantId, userId, 'payment.processed', 'payment', paymentIntentId);
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to process payment', { error: error.message });
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

/**
 * @swagger
 * /api/external-integrations/payments/refund:
 *   post:
 *     summary: Refund payment
 *     tags: [Payments]
 */
router.post('/payments/refund', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const { paymentIntentId, amountCents, reason } = refundPaymentSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getPaymentAdapter();
    const result = await adapter.refundPayment(paymentIntentId, amountCents, reason);

    if (result.success) {
      await auditLog(tenantId, userId, 'payment.refunded', 'payment', paymentIntentId);
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to process refund', { error: error.message });
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

/**
 * @swagger
 * /api/external-integrations/payments/webhook:
 *   post:
 *     summary: Stripe webhook handler
 *     tags: [Payments]
 */
router.post('/payments/webhook', async (req, res) => {
  try {
    // In production, verify Stripe signature
    const event = req.body;

    logger.info('Received Stripe webhook', { type: event.type });

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Update payment status
        break;
      case 'payment_intent.payment_failed':
        // Handle failed payment
        break;
      case 'charge.refunded':
        // Handle refund
        break;
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error('Webhook error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// FAX ROUTES
// ============================================================================

/**
 * @swagger
 * /api/external-integrations/fax/send:
 *   post:
 *     summary: Send a fax
 *     tags: [Fax]
 */
router.post('/fax/send', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = sendFaxSchema.parse(req.body);
    const { tenantId, id: userId } = req.user!;

    const service = getIntegrationService(tenantId);
    const adapter = await service.getFaxAdapter();
    const result = await adapter.sendFax({
      toNumber: data.toNumber,
      document: data.document,
      subject: data.subject,
      referralId: data.referralId,
      providerId: data.providerId,
      priority: data.priority,
    });

    await auditLog(tenantId, userId, 'fax.sent', 'fax', result.faxId);

    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    logger.error('Failed to send fax', { error: error.message });
    res.status(500).json({ error: 'Failed to send fax' });
  }
});

/**
 * @swagger
 * /api/external-integrations/fax/incoming:
 *   get:
 *     summary: Get pending incoming faxes
 *     tags: [Fax]
 */
router.get('/fax/incoming', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getFaxAdapter();
    const faxes = await adapter.getPendingIncomingFaxes();
    res.json({ faxes });
  } catch (error: any) {
    logger.error('Failed to get incoming faxes', { error: error.message });
    res.status(500).json({ error: 'Failed to get incoming faxes' });
  }
});

/**
 * @swagger
 * /api/external-integrations/fax/status/{faxId}:
 *   get:
 *     summary: Get fax status
 *     tags: [Fax]
 */
router.get('/fax/status/:faxId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { faxId } = req.params;
    const service = getIntegrationService(req.user!.tenantId);
    const adapter = await service.getFaxAdapter();
    const status = await adapter.getFaxStatus(faxId!);
    res.json(status);
  } catch (error: any) {
    logger.error('Failed to get fax status', { error: error.message });
    res.status(500).json({ error: 'Failed to get fax status' });
  }
});

/**
 * @swagger
 * /api/external-integrations/fax/{faxId}/attach:
 *   post:
 *     summary: Attach fax to referral
 *     tags: [Fax]
 */
router.post('/fax/:faxId/attach', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { faxId } = req.params;
    const { referralId, notes } = req.body;

    if (!referralId) {
      return res.status(400).json({ error: 'referralId is required' });
    }

    const { tenantId, id: userId } = req.user!;
    const service = getIntegrationService(tenantId);
    const adapter = await service.getFaxAdapter();
    const result = await adapter.attachFaxToReferral(faxId!, referralId, notes);

    if (result.success) {
      await auditLog(tenantId, userId, 'fax.attached_to_referral', 'fax', faxId!);
    }

    res.json(result);
  } catch (error: any) {
    logger.error('Failed to attach fax', { error: error.message });
    res.status(500).json({ error: 'Failed to attach fax' });
  }
});

export const externalIntegrationsRouter = router;
