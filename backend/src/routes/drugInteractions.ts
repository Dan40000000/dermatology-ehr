/**
 * Drug Interactions API Routes
 *
 * Provides endpoints for:
 * - Drug interaction checking
 * - Drug database search
 * - Drug information retrieval
 * - Patient drug alert management
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { pool } from '../db/pool';
import {
  checkAllergies,
  checkDuplicateTherapy,
  getDrugWarnings,
  comprehensiveSafetyCheck,
  searchDrugs,
  getDrugInfo,
  getPatientAlerts,
  acknowledgeAlert,
  createPatientAlert,
} from '../services/drugInteractionService';
import { logger } from '../lib/logger';

export const drugInteractionsRouter = Router();

// =============================================================================
// Types for database rows
// =============================================================================

interface DrugInteractionRow {
  id: string;
  drug1_rxcui: string;
  drug1_name: string;
  drug2_rxcui: string;
  drug2_name: string;
  severity: string;
  description: string;
  clinical_effects: string | null;
  management: string | null;
  mechanism: string | null;
  source: string | null;
  dermatology_relevance: number | null;
}

interface AllergyClassRow {
  id: string;
  allergy_class: string;
  class_display_name: string;
  related_drugs: string[];
  cross_reactivity_notes: string | null;
  cross_reactivity_rate: number | null;
  alternative_suggestions: string[] | null;
}

interface TherapeuticClassRow {
  therapeutic_class: string;
  pharmacologic_class: string | null;
}

interface DrugDatabaseRow {
  id: string;
  rxnorm_cui: string | null;
  drug_name: string;
  generic_name: string | null;
  drug_class: string | null;
  dosage_form: string | null;
  strength: string | null;
  is_controlled: boolean;
  dea_schedule: string | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const checkInteractionsSchema = z.object({
  patientId: z.string().uuid(),
  drugRxcui: z.string().min(1),
  drugName: z.string().min(1).optional(),
  encounterId: z.string().uuid().optional(),
  prescriptionId: z.string().uuid().optional(),
  saveAlerts: z.boolean().optional().default(false),
});

const searchDrugsSchema = z.object({
  query: z.string().min(2),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const acknowledgeAlertSchema = z.object({
  alertId: z.string().uuid(),
  override: z.boolean().optional().default(false),
  overrideReason: z.string().optional(),
});

// =============================================================================
// POST /api/drugs/check-interactions
// Check drug interactions for a patient
// =============================================================================
drugInteractionsRouter.post(
  '/check-interactions',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'nurse']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = checkInteractionsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const { patientId, drugRxcui, drugName, encounterId, prescriptionId, saveAlerts } = parsed.data;
      const tenantId = req.user!.tenantId;

      // Perform comprehensive safety check
      const safetyCheck = await comprehensiveSafetyCheck(
        patientId,
        drugRxcui,
        drugName || drugRxcui,
        tenantId
      );

      // Optionally save alerts to database
      if (saveAlerts && safetyCheck.alerts.length > 0) {
        for (const alert of safetyCheck.alerts) {
          try {
            await createPatientAlert(alert, tenantId, encounterId, prescriptionId);
          } catch (alertError) {
            logger.error('Failed to save drug alert', { error: alertError, alert });
          }
        }
      }

      return res.json({
        success: true,
        interactions: safetyCheck.drugInteractions,
        allergies: safetyCheck.allergyWarnings,
        duplicateTherapy: safetyCheck.duplicateTherapyAlerts,
        warnings: safetyCheck.drugWarnings,
        alerts: safetyCheck.alerts,
        hasCriticalAlerts: safetyCheck.hasCriticalAlerts,
        hasContraindicated: safetyCheck.hasContraindicated,
        summary: safetyCheck.summary,
      });
    } catch (error) {
      logger.error('Error checking drug interactions', { error });
      return res.status(500).json({ error: 'Failed to check drug interactions' });
    }
  }
);

// =============================================================================
// GET /api/drugs/search
// Search drug database
// =============================================================================
drugInteractionsRouter.get(
  '/search',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const parsed = searchDrugsSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const { query, limit } = parsed.data;
      const tenantId = req.user!.tenantId;

      const drugs = await searchDrugs(query, tenantId, limit);

      return res.json({
        success: true,
        drugs,
        count: drugs.length,
      });
    } catch (error) {
      logger.error('Error searching drugs', { error });
      return res.status(500).json({ error: 'Failed to search drugs' });
    }
  }
);

// =============================================================================
// GET /api/drugs/:rxcui/info
// Get drug information by RxCUI
// =============================================================================
drugInteractionsRouter.get(
  '/:rxcui/info',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { rxcui } = req.params;

      if (!rxcui) {
        return res.status(400).json({ error: 'RxCUI is required' });
      }

      const drugInfo = await getDrugInfo(rxcui);

      if (!drugInfo) {
        return res.status(404).json({ error: 'Drug not found' });
      }

      // Also get warnings for this drug
      const warnings = await getDrugWarnings(rxcui);

      return res.json({
        success: true,
        drug: drugInfo,
        warnings,
      });
    } catch (error) {
      logger.error('Error getting drug info', { error });
      return res.status(500).json({ error: 'Failed to get drug information' });
    }
  }
);

// =============================================================================
// GET /api/drugs/:rxcui/interactions
// Get known interactions for a specific drug
// =============================================================================
drugInteractionsRouter.get(
  '/:rxcui/interactions',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { rxcui } = req.params;

      if (!rxcui) {
        return res.status(400).json({ error: 'RxCUI is required' });
      }

      // Get all known interactions for this drug from database
      const result = await pool.query<DrugInteractionRow>(
        `SELECT * FROM drug_interactions
         WHERE drug1_rxcui = $1 OR drug2_rxcui = $1
         ORDER BY
           CASE severity
             WHEN 'contraindicated' THEN 1
             WHEN 'major' THEN 2
             WHEN 'moderate' THEN 3
             WHEN 'minor' THEN 4
           END,
           dermatology_relevance DESC`,
        [rxcui]
      );

      const interactions = result.rows.map((row: DrugInteractionRow) => ({
        id: row.id,
        severity: row.severity,
        interactingDrug: row.drug1_rxcui === rxcui ? row.drug2_name : row.drug1_name,
        interactingDrugRxcui: row.drug1_rxcui === rxcui ? row.drug2_rxcui : row.drug1_rxcui,
        description: row.description,
        clinicalEffects: row.clinical_effects,
        management: row.management,
        mechanism: row.mechanism,
        source: row.source,
      }));

      return res.json({
        success: true,
        rxcui,
        interactions,
        count: interactions.length,
      });
    } catch (error) {
      logger.error('Error getting drug interactions', { error });
      return res.status(500).json({ error: 'Failed to get drug interactions' });
    }
  }
);

// =============================================================================
// GET /api/drugs/:rxcui/warnings
// Get warnings for a specific drug
// =============================================================================
drugInteractionsRouter.get(
  '/:rxcui/warnings',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { rxcui } = req.params;

      if (!rxcui) {
        return res.status(400).json({ error: 'RxCUI is required' });
      }

      const warnings = await getDrugWarnings(rxcui);

      return res.json({
        success: true,
        rxcui,
        warnings,
        count: warnings.length,
      });
    } catch (error) {
      logger.error('Error getting drug warnings', { error });
      return res.status(500).json({ error: 'Failed to get drug warnings' });
    }
  }
);

// =============================================================================
// POST /api/drugs/alerts/acknowledge
// Acknowledge a drug alert
// =============================================================================
drugInteractionsRouter.post(
  '/alerts/acknowledge',
  requireAuth,
  requireRoles(['admin', 'provider']),
  async (req: AuthedRequest, res) => {
    try {
      const parsed = acknowledgeAlertSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.format() });
      }

      const { alertId, override, overrideReason } = parsed.data;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      // Validate override reason is provided when overriding
      if (override && !overrideReason) {
        return res.status(400).json({ error: 'Override reason is required when overriding alerts' });
      }

      await acknowledgeAlert(alertId, userId, tenantId, override, overrideReason);

      // Log audit trail
      await pool.query(
        `INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          userId,
          override ? 'drug_alert_override' : 'drug_alert_acknowledge',
          'patient_drug_alert',
          alertId,
          req.ip,
          JSON.stringify({ override, overrideReason }),
        ]
      );

      return res.json({
        success: true,
        message: override ? 'Alert overridden successfully' : 'Alert acknowledged successfully',
      });
    } catch (error) {
      logger.error('Error acknowledging drug alert', { error });
      return res.status(500).json({ error: 'Failed to acknowledge drug alert' });
    }
  }
);

// =============================================================================
// GET /api/patients/:patientId/drug-alerts
// Get patient's active drug alerts
// =============================================================================
drugInteractionsRouter.get(
  '/patients/:patientId/drug-alerts',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId } = req.params;
      const { includeAcknowledged } = req.query;
      const tenantId = req.user!.tenantId;

      if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required' });
      }

      // Verify patient belongs to tenant
      const patientCheck = await pool.query(
        'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2',
        [patientId, tenantId]
      );

      if (patientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const alerts = await getPatientAlerts(
        patientId,
        tenantId,
        includeAcknowledged === 'true'
      );

      // Group alerts by severity for convenience
      const grouped = {
        contraindicated: alerts.filter(a => a.severity === 'contraindicated'),
        major: alerts.filter(a => a.severity === 'major'),
        moderate: alerts.filter(a => a.severity === 'moderate'),
        minor: alerts.filter(a => a.severity === 'minor'),
        info: alerts.filter(a => a.severity === 'info'),
      };

      return res.json({
        success: true,
        alerts,
        grouped,
        summary: {
          total: alerts.length,
          contraindicated: grouped.contraindicated.length,
          major: grouped.major.length,
          moderate: grouped.moderate.length,
          minor: grouped.minor.length,
          info: grouped.info.length,
          unacknowledged: alerts.filter(a => !a.acknowledgedAt).length,
        },
      });
    } catch (error) {
      logger.error('Error getting patient drug alerts', { error });
      return res.status(500).json({ error: 'Failed to get patient drug alerts' });
    }
  }
);

// =============================================================================
// POST /api/drugs/check-allergy
// Check drug-allergy cross-reactivity
// =============================================================================
drugInteractionsRouter.post(
  '/check-allergy',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, drugRxcui } = req.body as { patientId: string; drugRxcui: string };
      const tenantId = req.user!.tenantId;

      if (!patientId || !drugRxcui) {
        return res.status(400).json({ error: 'patientId and drugRxcui are required' });
      }

      const allergies = await checkAllergies(patientId, drugRxcui, tenantId);

      return res.json({
        success: true,
        allergies,
        hasAllergyWarning: allergies.length > 0,
        count: allergies.length,
      });
    } catch (error) {
      logger.error('Error checking drug allergy', { error });
      return res.status(500).json({ error: 'Failed to check drug allergy' });
    }
  }
);

// =============================================================================
// POST /api/drugs/check-duplicate-therapy
// Check for duplicate therapy
// =============================================================================
drugInteractionsRouter.post(
  '/check-duplicate-therapy',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { patientId, drugClass, drugName } = req.body as {
        patientId: string;
        drugClass: string;
        drugName: string;
      };
      const tenantId = req.user!.tenantId;

      if (!patientId || !drugClass || !drugName) {
        return res.status(400).json({ error: 'patientId, drugClass, and drugName are required' });
      }

      const duplicates = await checkDuplicateTherapy(patientId, drugClass, drugName, tenantId);

      return res.json({
        success: true,
        duplicates,
        hasDuplicateTherapy: duplicates.length > 0,
        count: duplicates.length,
      });
    } catch (error) {
      logger.error('Error checking duplicate therapy', { error });
      return res.status(500).json({ error: 'Failed to check duplicate therapy' });
    }
  }
);

// =============================================================================
// GET /api/drugs/allergy-classes
// Get all drug allergy classes (for reference)
// =============================================================================
drugInteractionsRouter.get(
  '/allergy-classes',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query<AllergyClassRow>(
        `SELECT
          id,
          allergy_class,
          class_display_name,
          related_drugs,
          cross_reactivity_notes,
          cross_reactivity_rate,
          alternative_suggestions
         FROM drug_allergy_classes
         ORDER BY class_display_name`
      );

      return res.json({
        success: true,
        classes: result.rows.map((row: AllergyClassRow) => ({
          id: row.id,
          allergyClass: row.allergy_class,
          displayName: row.class_display_name,
          relatedDrugs: row.related_drugs,
          crossReactivityNotes: row.cross_reactivity_notes,
          crossReactivityRate: row.cross_reactivity_rate,
          alternatives: row.alternative_suggestions,
        })),
        count: result.rows.length,
      });
    } catch (error) {
      logger.error('Error getting allergy classes', { error });
      return res.status(500).json({ error: 'Failed to get allergy classes' });
    }
  }
);

// =============================================================================
// GET /api/drugs/therapeutic-classes
// Get all therapeutic classes (for duplicate therapy detection)
// =============================================================================
drugInteractionsRouter.get(
  '/therapeutic-classes',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const result = await pool.query<TherapeuticClassRow>(
        `SELECT DISTINCT therapeutic_class, pharmacologic_class
         FROM drug_class_mapping
         WHERE therapeutic_class IS NOT NULL
         ORDER BY therapeutic_class`
      );

      // Group by therapeutic class
      const classMap = new Map<string, string[]>();
      for (const row of result.rows) {
        const existing = classMap.get(row.therapeutic_class) || [];
        if (row.pharmacologic_class && !existing.includes(row.pharmacologic_class)) {
          existing.push(row.pharmacologic_class);
        }
        classMap.set(row.therapeutic_class, existing);
      }

      const classes = Array.from(classMap.entries()).map(([name, subclasses]) => ({
        therapeuticClass: name,
        pharmacologicClasses: subclasses,
      }));

      return res.json({
        success: true,
        classes,
        count: classes.length,
      });
    } catch (error) {
      logger.error('Error getting therapeutic classes', { error });
      return res.status(500).json({ error: 'Failed to get therapeutic classes' });
    }
  }
);

// =============================================================================
// GET /api/drugs/derm-common
// Get commonly used dermatology medications
// =============================================================================
drugInteractionsRouter.get(
  '/derm-common',
  requireAuth,
  async (req: AuthedRequest, res) => {
    try {
      const { category, limit = '50' } = req.query as { category?: string; limit?: string };

      let query = `
        SELECT
          id,
          rxnorm_cui,
          drug_name,
          generic_name,
          drug_class,
          dosage_form,
          strength,
          is_controlled,
          dea_schedule
        FROM drug_database
        WHERE is_dermatology_common = true
      `;

      const params: (string | number)[] = [];
      let paramIndex = 1;

      if (category) {
        query += ` AND drug_class ILIKE $${paramIndex}`;
        params.push(`%${category}%`);
        paramIndex++;
      }

      query += ` ORDER BY drug_name LIMIT $${paramIndex}`;
      params.push(Number(limit));

      const result = await pool.query<DrugDatabaseRow>(query, params);

      return res.json({
        success: true,
        drugs: result.rows.map((row: DrugDatabaseRow) => ({
          id: row.id,
          rxnormCui: row.rxnorm_cui,
          drugName: row.drug_name,
          genericName: row.generic_name,
          drugClass: row.drug_class,
          dosageForm: row.dosage_form,
          strength: row.strength,
          isControlled: row.is_controlled,
          deaSchedule: row.dea_schedule,
        })),
        count: result.rows.length,
      });
    } catch (error) {
      logger.error('Error getting common derm drugs', { error });
      return res.status(500).json({ error: 'Failed to get common dermatology drugs' });
    }
  }
);
