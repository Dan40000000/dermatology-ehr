/**
 * Revenue Cycle Management API Routes
 * Endpoints for charge capture, denial management, payment plans,
 * underpayment detection, and revenue cycle KPIs.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { auditLog } from '../services/audit';
import {
  revenueCycleService,
  DenialCategory,
} from '../services/revenueCycleService';

export const revenueCycleRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const cptCodeSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  units: z.number().int().positive().default(1),
});

const icdCodeSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const captureChargesSchema = z.object({
  encounterId: z.string().uuid(),
  patientId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  cptCodes: z.array(cptCodeSchema).min(1),
  icdCodes: z.array(icdCodeSchema).min(1),
  notes: z.string().optional(),
});

const recordDenialSchema = z.object({
  claimId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  payerId: z.string().optional(),
  payerName: z.string().optional(),
  denialCode: z.string().min(1),
  denialReason: z.string().min(1),
  remarkCodes: z.array(z.string()).optional(),
  serviceDate: z.string().optional(),
  billedAmountCents: z.number().int().optional(),
  amountCents: z.number().int().min(0),
});

const supportingDocSchema = z.object({
  docId: z.string(),
  docType: z.string(),
  description: z.string().optional(),
});

const submitAppealSchema = z.object({
  denialId: z.string().uuid(),
  appealLevel: z.number().int().positive().optional(),
  appealType: z.enum(['written', 'peer_to_peer', 'external_review']),
  templateId: z.string().uuid().optional(),
  customLetter: z.string().optional(),
  supportingDocs: z.array(supportingDocSchema).optional(),
});

const createPaymentPlanSchema = z.object({
  patientId: z.string().uuid(),
  totalAmountCents: z.number().int().positive(),
  numberOfPayments: z.number().int().positive().max(60),
  startDate: z.string(),
  downPaymentCents: z.number().int().min(0).optional(),
  interestRate: z.number().min(0).max(30).optional(),
  autopayEnabled: z.boolean().optional(),
  autopayPaymentMethodId: z.string().uuid().optional(),
  associatedEncounters: z.array(z.string().uuid()).optional(),
  associatedClaims: z.array(z.string().uuid()).optional(),
  paymentDayOfMonth: z.number().int().min(1).max(28).optional(),
  notes: z.string().optional(),
});

const recordPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  paymentMethod: z.enum(['card', 'ach', 'check', 'cash']),
  paymentMethodLastFour: z.string().max(4).optional(),
  transactionReference: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Charge Capture Endpoints
// ============================================================================

/**
 * POST /api/rcm/charges
 * Capture charges for an encounter
 */
revenueCycleRouter.post(
  '/charges',
  requireAuth,
  requireRoles(['admin', 'billing', 'provider']),
  async (req: AuthedRequest, res) => {
    const parsed = captureChargesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const chargeCapture = await revenueCycleService.captureCharges(
        tenantId,
        parsed.data.encounterId,
        parsed.data.patientId,
        {
          providerId: parsed.data.providerId,
          cptCodes: parsed.data.cptCodes,
          icdCodes: parsed.data.icdCodes,
          capturedBy: userId,
          notes: parsed.data.notes,
        }
      );

      await auditLog(tenantId, userId, 'charges_captured', 'charge_capture', chargeCapture.id);

      return res.status(201).json(chargeCapture);
    } catch (error: any) {
      console.error('Error capturing charges:', error);
      return res.status(500).json({ error: error.message || 'Failed to capture charges' });
    }
  }
);

/**
 * GET /api/rcm/charges/:encounterId
 * Get charges for an encounter
 */
revenueCycleRouter.get(
  '/charges/:encounterId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const encounterId = String(req.params.encounterId);

      const charges = await revenueCycleService.getEncounterCharges(tenantId, encounterId);

      return res.json({ charges });
    } catch (error: any) {
      console.error('Error getting encounter charges:', error);
      return res.status(500).json({ error: error.message || 'Failed to get charges' });
    }
  }
);

/**
 * POST /api/rcm/charges/:id/validate
 * Validate charges against chargemaster
 */
revenueCycleRouter.post(
  '/charges/:id/validate',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const chargeCaptureId = String(req.params.id);

      const result = await revenueCycleService.validateCharges(tenantId, chargeCaptureId);

      return res.json(result);
    } catch (error: any) {
      console.error('Error validating charges:', error);
      return res.status(500).json({ error: error.message || 'Failed to validate charges' });
    }
  }
);

// ============================================================================
// Denial Management Endpoints
// ============================================================================

/**
 * POST /api/rcm/denials
 * Record a claim denial
 */
revenueCycleRouter.post(
  '/denials',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    const parsed = recordDenialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const denial = await revenueCycleService.processDenial(tenantId, parsed.data);

      await auditLog(tenantId, userId, 'denial_recorded', 'claim_denial', denial.id);

      return res.status(201).json(denial);
    } catch (error: any) {
      console.error('Error recording denial:', error);
      return res.status(500).json({ error: error.message || 'Failed to record denial' });
    }
  }
);

/**
 * GET /api/rcm/denials
 * List denials with filters
 */
revenueCycleRouter.get(
  '/denials',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const filters = {
        status: req.query.status as string | undefined,
        category: req.query.category as string | undefined,
        payerId: req.query.payerId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await revenueCycleService.getDenials(tenantId, filters);

      return res.json(result);
    } catch (error: any) {
      console.error('Error getting denials:', error);
      return res.status(500).json({ error: error.message || 'Failed to get denials' });
    }
  }
);

/**
 * GET /api/rcm/denials/categories
 * Get denial category options
 */
revenueCycleRouter.get('/denials/categories', requireAuth, async (_req: AuthedRequest, res) => {
  return res.json({
    categories: Object.values(DenialCategory).map((category) => ({
      value: category,
      label: category.replace(/_/g, ' '),
      description: getCategoryDescription(category),
    })),
  });
});

/**
 * POST /api/rcm/appeals
 * Submit an appeal for a denial
 */
revenueCycleRouter.post(
  '/appeals',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    const parsed = submitAppealSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const appeal = await revenueCycleService.generateAppeal(tenantId, parsed.data.denialId, {
        appealLevel: parsed.data.appealLevel,
        appealType: parsed.data.appealType,
        templateId: parsed.data.templateId,
        customLetter: parsed.data.customLetter,
        supportingDocs: parsed.data.supportingDocs,
        submittedBy: userId,
      });

      await auditLog(tenantId, userId, 'appeal_submitted', 'claim_appeal', appeal.id);

      return res.status(201).json(appeal);
    } catch (error: any) {
      console.error('Error submitting appeal:', error);
      return res.status(500).json({ error: error.message || 'Failed to submit appeal' });
    }
  }
);

// ============================================================================
// Payment Plan Endpoints
// ============================================================================

/**
 * POST /api/rcm/payment-plans
 * Create a patient payment plan
 */
revenueCycleRouter.post(
  '/payment-plans',
  requireAuth,
  requireRoles(['admin', 'billing', 'front_desk']),
  async (req: AuthedRequest, res) => {
    const parsed = createPaymentPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const plan = await revenueCycleService.createPaymentPlan(tenantId, parsed.data.patientId, {
        ...parsed.data,
        createdBy: userId,
      });

      await auditLog(tenantId, userId, 'payment_plan_created', 'payment_plan', plan.id);

      return res.status(201).json(plan);
    } catch (error: any) {
      console.error('Error creating payment plan:', error);
      return res.status(500).json({ error: error.message || 'Failed to create payment plan' });
    }
  }
);

/**
 * GET /api/rcm/payment-plans/:patientId
 * Get payment plans for a patient
 */
revenueCycleRouter.get(
  '/payment-plans/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const patientId = String(req.params.patientId);

      const plans = await revenueCycleService.getPatientPaymentPlans(tenantId, patientId);

      return res.json({ plans });
    } catch (error: any) {
      console.error('Error getting payment plans:', error);
      return res.status(500).json({ error: error.message || 'Failed to get payment plans' });
    }
  }
);

/**
 * GET /api/rcm/payment-plans/:id/transactions
 * Get transactions for a payment plan
 */
revenueCycleRouter.get(
  '/payment-plans/:id/transactions',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const planId = String(req.params.id);

      const transactions = await revenueCycleService.getPaymentPlanTransactions(tenantId, planId);

      return res.json({ transactions });
    } catch (error: any) {
      console.error('Error getting payment plan transactions:', error);
      return res.status(500).json({ error: error.message || 'Failed to get transactions' });
    }
  }
);

/**
 * POST /api/rcm/payment-plans/:id/payment
 * Record a payment for a payment plan
 */
revenueCycleRouter.post(
  '/payment-plans/:id/payment',
  requireAuth,
  requireRoles(['admin', 'billing', 'front_desk']),
  async (req: AuthedRequest, res) => {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const planId = String(req.params.id);

      const transaction = await revenueCycleService.processPaymentPlanPayment(tenantId, planId, {
        ...parsed.data,
        processedBy: userId,
      });

      await auditLog(tenantId, userId, 'payment_plan_payment', 'payment_plan_transaction', transaction.id);

      return res.json(transaction);
    } catch (error: any) {
      console.error('Error processing payment plan payment:', error);
      return res.status(500).json({ error: error.message || 'Failed to process payment' });
    }
  }
);

// ============================================================================
// Underpayment Endpoints
// ============================================================================

/**
 * GET /api/rcm/underpayments
 * List underpayments with filters
 */
revenueCycleRouter.get(
  '/underpayments',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const filters = {
        status: req.query.status as string | undefined,
        payerId: req.query.payerId as string | undefined,
        minVarianceCents: req.query.minVariance
          ? parseInt(req.query.minVariance as string)
          : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };

      const result = await revenueCycleService.getUnderpayments(tenantId, filters);

      return res.json(result);
    } catch (error: any) {
      console.error('Error getting underpayments:', error);
      return res.status(500).json({ error: error.message || 'Failed to get underpayments' });
    }
  }
);

/**
 * POST /api/rcm/underpayments/check
 * Check for underpayment on a payment
 */
revenueCycleRouter.post(
  '/underpayments/check',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    const schema = z.object({
      claimId: z.string().uuid(),
      eraId: z.string().uuid().optional(),
      payerId: z.string().optional(),
      payerName: z.string().optional(),
      cptCode: z.string().min(1),
      serviceDate: z.string().optional(),
      units: z.number().int().positive().optional(),
      paidAmountCents: z.number().int().min(0),
      adjustmentCodes: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;

      const underpayment = await revenueCycleService.identifyUnderpayment(tenantId, parsed.data);

      return res.json({
        underpaymentIdentified: underpayment !== null,
        underpayment,
      });
    } catch (error: any) {
      console.error('Error checking for underpayment:', error);
      return res.status(500).json({ error: error.message || 'Failed to check underpayment' });
    }
  }
);

// ============================================================================
// Contract Endpoints
// ============================================================================

/**
 * GET /api/rcm/contracts
 * List payer contracts
 */
revenueCycleRouter.get(
  '/contracts',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const filters = {
        status: req.query.status as string | undefined,
        payerId: req.query.payerId as string | undefined,
        includeExpired: req.query.includeExpired === 'true',
      };

      const contracts = await revenueCycleService.getPayerContracts(tenantId, filters);

      return res.json({ contracts });
    } catch (error: any) {
      console.error('Error getting payer contracts:', error);
      return res.status(500).json({ error: error.message || 'Failed to get contracts' });
    }
  }
);

/**
 * GET /api/rcm/contracts/verify-rate
 * Verify contract rate for a service
 */
revenueCycleRouter.get(
  '/contracts/verify-rate',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const payerId = req.query.payerId as string;
      const cptCode = req.query.cptCode as string;

      if (!payerId || !cptCode) {
        return res.status(400).json({ error: 'payerId and cptCode are required' });
      }

      const result = await revenueCycleService.verifyContractRate(tenantId, payerId, cptCode);

      return res.json(result);
    } catch (error: any) {
      console.error('Error verifying contract rate:', error);
      return res.status(500).json({ error: error.message || 'Failed to verify rate' });
    }
  }
);

// ============================================================================
// Dashboard and Metrics Endpoints
// ============================================================================

/**
 * GET /api/rcm/dashboard
 * Get revenue cycle KPIs and metrics
 */
revenueCycleRouter.get(
  '/dashboard',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const dashboard = await revenueCycleService.getRevenueDashboard(tenantId);

      return res.json(dashboard);
    } catch (error: any) {
      console.error('Error getting revenue dashboard:', error);
      return res.status(500).json({ error: error.message || 'Failed to get dashboard' });
    }
  }
);

// ============================================================================
// Automation Endpoints
// ============================================================================

/**
 * POST /api/rcm/jobs/denial-processing
 * Trigger daily denial processing job
 */
revenueCycleRouter.post(
  '/jobs/denial-processing',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await revenueCycleService.runDailyDenialProcessing(tenantId);

      return res.json({
        message: 'Daily denial processing completed',
        ...result,
      });
    } catch (error: any) {
      console.error('Error running denial processing:', error);
      return res.status(500).json({ error: error.message || 'Failed to run denial processing' });
    }
  }
);

/**
 * GET /api/rcm/payment-plans/reminders
 * Get payment plans due for reminder
 */
revenueCycleRouter.get(
  '/payment-plans-reminders',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const daysBeforeDue = req.query.days ? parseInt(req.query.days as string) : 3;

      const plans = await revenueCycleService.getPaymentPlansForReminder(tenantId, daysBeforeDue);

      return res.json({ plans, count: plans.length });
    } catch (error: any) {
      console.error('Error getting payment plan reminders:', error);
      return res.status(500).json({ error: error.message || 'Failed to get reminders' });
    }
  }
);

/**
 * POST /api/rcm/collection/escalate
 * Trigger collection escalation for a patient
 */
revenueCycleRouter.post(
  '/collection/escalate',
  requireAuth,
  requireRoles(['admin', 'billing']),
  async (req: AuthedRequest, res) => {
    const schema = z.object({
      patientId: z.string().uuid(),
      balanceCents: z.number().int().positive(),
      daysPastDue: z.number().int().min(0),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    try {
      const tenantId = req.user!.tenantId;

      const result = await revenueCycleService.escalateCollection(
        tenantId,
        parsed.data.patientId,
        parsed.data.balanceCents,
        parsed.data.daysPastDue
      );

      if (result) {
        return res.json({
          escalated: true,
          ...result,
        });
      } else {
        return res.json({
          escalated: false,
          message: 'No applicable escalation rule found or action already taken',
        });
      }
    } catch (error: any) {
      console.error('Error escalating collection:', error);
      return res.status(500).json({ error: error.message || 'Failed to escalate collection' });
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function getCategoryDescription(category: DenialCategory): string {
  const descriptions: Record<DenialCategory, string> = {
    [DenialCategory.ELIGIBILITY]:
      'Patient eligibility issues - not covered, inactive, or terminated coverage',
    [DenialCategory.AUTHORIZATION]:
      'Prior authorization required but not obtained or invalid',
    [DenialCategory.CODING]: 'Invalid, incorrect, or bundled CPT/ICD codes',
    [DenialCategory.DOCUMENTATION]:
      'Missing or insufficient clinical documentation to support medical necessity',
    [DenialCategory.DUPLICATE]: 'Claim already processed or duplicate submission',
    [DenialCategory.TIMELY_FILING]: 'Claim submitted after payer filing deadline',
  };
  return descriptions[category] || '';
}
