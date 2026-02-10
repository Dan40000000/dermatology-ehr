/**
 * Allergy Alert API Routes
 *
 * Endpoints for managing patient allergies and allergy alerts
 * in the dermatology EHR system.
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import {
  allergyAlertService,
  AllergenType,
  AllergySeverity,
  AllergyStatus,
  AlertAction,
  AlertType,
  AlertSeverity
} from '../services/allergyAlertService';

export const allergiesRouter = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const allergenTypeEnum = z.enum(['drug', 'food', 'environmental', 'latex', 'contact']);
const severityEnum = z.enum(['mild', 'moderate', 'severe', 'life_threatening']);
const statusEnum = z.enum(['active', 'inactive', 'resolved', 'entered_in_error']);
const alertActionEnum = z.enum(['override', 'cancelled', 'changed', 'acknowledged', 'pending']);
const alertTypeEnum = z.enum(['drug_allergy', 'cross_reactivity', 'latex', 'adhesive', 'contact', 'food']);
const alertSeverityEnum = z.enum(['info', 'warning', 'critical', 'contraindicated']);

const addAllergySchema = z.object({
  allergenType: allergenTypeEnum,
  allergenName: z.string().min(1).max(255),
  rxcui: z.string().max(20).optional(),
  reactionType: z.string().max(100).optional(),
  severity: severityEnum,
  onsetDate: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().max(50).optional(),
  symptoms: z.array(z.string()).optional(),
  reactionDescription: z.string().optional()
});

const updateAllergySchema = z.object({
  allergenType: allergenTypeEnum.optional(),
  allergenName: z.string().min(1).max(255).optional(),
  rxcui: z.string().max(20).optional().nullable(),
  reactionType: z.string().max(100).optional().nullable(),
  severity: severityEnum.optional(),
  onsetDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: statusEnum.optional()
});

const checkDrugSchema = z.object({
  patientId: z.string().uuid(),
  rxcui: z.string().max(20),
  drugName: z.string().min(1)
});

const logAlertActionSchema = z.object({
  patientId: z.string().uuid(),
  alertType: alertTypeEnum,
  alertSeverity: alertSeverityEnum,
  action: alertActionEnum,
  triggerDrug: z.string().optional(),
  triggerRxcui: z.string().optional(),
  allergyId: z.string().uuid().optional(),
  alertMessage: z.string().optional(),
  crossReactiveWith: z.string().optional(),
  displayContext: z.string().optional(),
  encounterId: z.string().uuid().optional(),
  prescriptionId: z.string().uuid().optional(),
  actionReason: z.string().optional()
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/allergies/patient/:patientId
 * Get all allergies for a patient
 */
allergiesRouter.get(
  '/patient/:patientId',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const { status, includeReactions } = req.query;

      const allergies = await allergyAlertService.getPatientAllergies(
        patientId ?? '',
        tenantId ?? '',
        {
          status: status as AllergyStatus | undefined,
          includeReactions: includeReactions === 'true'
        }
      );

      return res.json({ allergies });
    } catch (error) {
      console.error('Error fetching patient allergies:', error);
      return res.status(500).json({ error: 'Failed to fetch patient allergies' });
    }
  }
);

/**
 * POST /api/allergies/patient/:patientId
 * Add a new allergy for a patient
 */
allergiesRouter.post(
  '/patient/:patientId',
  requireAuth,
  requireRoles(['admin', 'provider', 'nurse', 'ma']),
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const parsed = addAllergySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const result = await allergyAlertService.addAllergy(
        patientId ?? '',
        parsed.data,
        tenantId ?? '',
        userId
      );

      return res.status(201).json(result);
    } catch (error: unknown) {
      console.error('Error adding allergy:', error);
      // Check for unique constraint violation
      if (error instanceof Error && error.message.includes('unique_patient_allergen')) {
        return res.status(409).json({ error: 'This allergy already exists for this patient' });
      }
      return res.status(500).json({ error: 'Failed to add allergy' });
    }
  }
);

/**
 * PUT /api/allergies/:id
 * Update an existing allergy
 */
allergiesRouter.put(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const parsed = updateAllergySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      // Convert null values to undefined for the service
      const updates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined) {
          updates[key] = value === null ? undefined : value;
        }
      }

      const result = await allergyAlertService.updateAllergy(
        id ?? '',
        updates as Parameters<typeof allergyAlertService.updateAllergy>[1],
        tenantId ?? '',
        userId
      );

      return res.json(result);
    } catch (error) {
      console.error('Error updating allergy:', error);
      return res.status(500).json({ error: 'Failed to update allergy' });
    }
  }
);

/**
 * DELETE /api/allergies/:id
 * Soft delete (inactivate) an allergy
 */
allergiesRouter.delete(
  '/:id',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await allergyAlertService.deleteAllergy(id ?? '', tenantId ?? '', userId);

      return res.json(result);
    } catch (error) {
      console.error('Error deleting allergy:', error);
      return res.status(500).json({ error: 'Failed to delete allergy' });
    }
  }
);

/**
 * POST /api/allergies/:id/verify
 * Mark an allergy as clinically verified
 */
allergiesRouter.post(
  '/:id/verify',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const result = await allergyAlertService.verifyAllergy(id ?? '', tenantId ?? '', userId);

      return res.json(result);
    } catch (error) {
      console.error('Error verifying allergy:', error);
      return res.status(500).json({ error: 'Failed to verify allergy' });
    }
  }
);

/**
 * POST /api/allergies/check-drug
 * Check if a drug conflicts with patient's allergies
 */
allergiesRouter.post(
  '/check-drug',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;

      const parsed = checkDrugSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const { patientId, rxcui, drugName } = parsed.data;

      const result = await allergyAlertService.checkDrugAllergy(
        patientId,
        rxcui,
        drugName,
        tenantId
      );

      return res.json(result);
    } catch (error) {
      console.error('Error checking drug allergy:', error);
      return res.status(500).json({ error: 'Failed to check drug allergy' });
    }
  }
);

/**
 * GET /api/allergies/:patientId/alerts
 * Get all active allergy alerts for a patient
 */
allergiesRouter.get(
  '/:patientId/alerts',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const alerts = await allergyAlertService.getActiveAlerts(patientId ?? '', tenantId ?? '');

      return res.json({ alerts });
    } catch (error) {
      console.error('Error fetching allergy alerts:', error);
      return res.status(500).json({ error: 'Failed to fetch allergy alerts' });
    }
  }
);

/**
 * GET /api/allergies/:patientId/latex-check
 * Check for latex allergy
 */
allergiesRouter.get(
  '/:patientId/latex-check',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const alert = await allergyAlertService.checkLatexAllergy(patientId ?? '', tenantId ?? '');

      return res.json({
        hasLatexAllergy: alert !== null,
        alert
      });
    } catch (error) {
      console.error('Error checking latex allergy:', error);
      return res.status(500).json({ error: 'Failed to check latex allergy' });
    }
  }
);

/**
 * GET /api/allergies/:patientId/adhesive-check
 * Check for adhesive/tape allergy
 */
allergiesRouter.get(
  '/:patientId/adhesive-check',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;

      const alert = await allergyAlertService.checkAdhesiveAllergy(patientId ?? '', tenantId ?? '');

      return res.json({
        hasAdhesiveAllergy: alert !== null,
        alert
      });
    } catch (error) {
      console.error('Error checking adhesive allergy:', error);
      return res.status(500).json({ error: 'Failed to check adhesive allergy' });
    }
  }
);

/**
 * POST /api/allergies/alerts/:id/override
 * Log an alert override action
 */
allergiesRouter.post(
  '/alerts/:id/override',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const parsed = logAlertActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const {
        patientId,
        alertType,
        alertSeverity,
        action,
        triggerDrug,
        triggerRxcui,
        allergyId,
        alertMessage,
        crossReactiveWith,
        displayContext,
        encounterId,
        prescriptionId,
        actionReason
      } = parsed.data;

      const result = await allergyAlertService.logAlertAction(
        {
          patientId,
          alertType,
          alertSeverity,
          triggerDrug,
          triggerRxcui,
          allergyId,
          alertMessage,
          crossReactiveWith,
          displayContext,
          encounterId,
          prescriptionId
        },
        action,
        userId,
        tenantId,
        actionReason
      );

      return res.json(result);
    } catch (error) {
      console.error('Error logging alert action:', error);
      return res.status(500).json({ error: 'Failed to log alert action' });
    }
  }
);

/**
 * GET /api/allergies/:patientId/alert-history
 * Get alert history for a patient (audit trail)
 */
allergiesRouter.get(
  '/:patientId/alert-history',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const tenantId = req.user!.tenantId;
      const { startDate, endDate, alertType, limit } = req.query;

      const history = await allergyAlertService.getAlertHistory(
        patientId ?? '',
        tenantId ?? '',
        {
          startDate: startDate as string | undefined,
          endDate: endDate as string | undefined,
          alertType: alertType as AlertType | undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined
        }
      );

      return res.json({ history });
    } catch (error) {
      console.error('Error fetching alert history:', error);
      return res.status(500).json({ error: 'Failed to fetch alert history' });
    }
  }
);

/**
 * GET /api/allergies/common
 * Get list of common dermatology allergies for quick selection
 */
allergiesRouter.get(
  '/common',
  requireAuth,
  async (_req: AuthedRequest, res) => {
    try {
      const commonAllergies = allergyAlertService.getCommonDermatologyAllergies();
      return res.json(commonAllergies);
    } catch (error) {
      console.error('Error fetching common allergies:', error);
      return res.status(500).json({ error: 'Failed to fetch common allergies' });
    }
  }
);

/**
 * POST /api/allergies/check-cross-reactivity
 * Check for cross-reactivity with a specific drug
 */
allergiesRouter.post(
  '/check-cross-reactivity',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const tenantId = req.user!.tenantId;
      const { patientId, drugName } = req.body;

      if (!patientId || !drugName) {
        return res.status(400).json({ error: 'patientId and drugName are required' });
      }

      const alerts = await allergyAlertService.checkCrossReactivity(
        patientId,
        drugName,
        tenantId
      );

      return res.json({
        hasCrossReactivity: alerts.length > 0,
        alerts
      });
    } catch (error) {
      console.error('Error checking cross-reactivity:', error);
      return res.status(500).json({ error: 'Failed to check cross-reactivity' });
    }
  }
);
