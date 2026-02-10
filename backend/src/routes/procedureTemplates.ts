/**
 * Procedure Templates Routes
 * API endpoints for dermatology procedure documentation
 */

import { Router, Response } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { logger } from '../lib/logger';
import {
  ProcedureTemplateService,
  ProcedureType,
  ProcedureDocumentationInput
} from '../services/procedureTemplateService';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ============================================
// VALIDATION SCHEMAS
// ============================================

const procedureTypeEnum = z.enum([
  'cryotherapy',
  'shave_biopsy',
  'punch_biopsy',
  'excision',
  'incision_drainage'
]);

const lateralityEnum = z.enum(['left', 'right', 'bilateral', 'midline']);

const documentProcedureSchema = z.object({
  encounter_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  procedure_type: procedureTypeEnum,
  procedure_name: z.string().optional(),
  body_location: z.string().min(1),
  body_location_code: z.string().optional(),
  laterality: lateralityEnum.optional(),
  lesion_description: z.string().optional(),
  lesion_size_mm: z.number().positive().optional(),
  lesion_type: z.string().optional(),
  size_mm: z.number().positive().optional(),
  depth: z.string().optional(),
  dimensions_length_mm: z.number().positive().optional(),
  dimensions_width_mm: z.number().positive().optional(),
  dimensions_depth_mm: z.number().positive().optional(),
  anesthesia_type: z.string().optional(),
  anesthesia_agent: z.string().optional(),
  anesthesia_concentration: z.string().optional(),
  anesthesia_with_epinephrine: z.boolean().optional(),
  anesthesia_volume_ml: z.number().positive().optional(),
  documentation: z.record(z.string(), z.unknown()).default({}),
  hemostasis_method: z.string().optional(),
  hemostasis_details: z.string().optional(),
  closure_type: z.string().optional(),
  suture_type: z.string().optional(),
  suture_size: z.string().optional(),
  suture_count: z.number().int().positive().optional(),
  complications: z.array(z.string()).optional(),
  complication_details: z.string().optional(),
  specimen_sent: z.boolean().optional(),
  specimen_container: z.string().optional(),
  specimen_label: z.string().optional(),
  margins_taken_mm: z.number().positive().optional(),
  margins_peripheral_mm: z.number().positive().optional(),
  margins_deep_mm: z.number().positive().optional(),
  patient_instructions_given: z.boolean().optional(),
  wound_care_handout_provided: z.boolean().optional(),
  follow_up_instructions: z.string().optional(),
  performing_provider_id: z.string().uuid(),
  assistant_id: z.string().uuid().optional(),
  cpt_code: z.string().optional(),
  cpt_modifier: z.string().optional(),
  units: z.number().int().positive().optional(),
  procedure_start_time: z.string().datetime().optional(),
  procedure_end_time: z.string().datetime().optional(),
  supplies: z.array(z.object({
    supply_name: z.string(),
    quantity: z.number().int().positive().default(1),
    lot_number: z.string().optional(),
    expiration_date: z.string().optional(),
    inventory_item_id: z.string().uuid().optional()
  })).optional()
});

const updateProcedureSchema = documentProcedureSchema.partial().omit({
  encounter_id: true,
  patient_id: true,
  procedure_type: true,
  performing_provider_id: true,
  supplies: true
});

const linkPathologySchema = z.object({
  pathology_order_id: z.string().uuid()
});

// ============================================
// TEMPLATE ROUTES
// ============================================

/**
 * GET /api/procedure-templates
 * List all procedure templates for tenant
 */
router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const activeOnly = req.query.active !== 'false';

    const templates = await ProcedureTemplateService.getAllTemplates(tenantId, activeOnly);

    res.json({ templates });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching procedure templates', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch procedure templates' });
  }
});

/**
 * GET /api/procedure-templates/:type
 * Get specific procedure template by type
 */
router.get('/:type', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { type } = req.params;

    // Validate procedure type
    const validTypes: ProcedureType[] = [
      'cryotherapy',
      'shave_biopsy',
      'punch_biopsy',
      'excision',
      'incision_drainage'
    ];

    if (!validTypes.includes(type as ProcedureType)) {
      return res.status(400).json({
        error: 'Invalid procedure type',
        valid_types: validTypes
      });
    }

    const template = await ProcedureTemplateService.getTemplate(
      tenantId,
      type as ProcedureType
    );

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching procedure template', {
      error: err.message,
      type: req.params.type
    });
    res.status(500).json({ error: 'Failed to fetch procedure template' });
  }
});

// ============================================
// PROCEDURE DOCUMENTATION ROUTES
// ============================================

/**
 * POST /api/procedures/document
 * Save procedure documentation
 */
router.post('/document', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const validated = documentProcedureSchema.parse(req.body);

    // Extract supplies before documenting
    const { supplies, ...procedureData } = validated;

    // Convert datetime strings to Date objects if present
    const input: ProcedureDocumentationInput = {
      ...procedureData,
      procedure_start_time: validated.procedure_start_time
        ? new Date(validated.procedure_start_time)
        : undefined,
      procedure_end_time: validated.procedure_end_time
        ? new Date(validated.procedure_end_time)
        : undefined
    };

    const procedure = await ProcedureTemplateService.documentProcedure(
      tenantId,
      userId,
      input
    );

    // Add supplies if provided
    if (supplies && supplies.length > 0) {
      await ProcedureTemplateService.addSupplies(
        procedure.id,
        supplies.map(s => ({
          ...s,
          expiration_date: s.expiration_date ? new Date(s.expiration_date) : undefined
        }))
      );
    }

    logger.info('Procedure documented', {
      procedureId: procedure.id,
      encounterId: procedure.encounter_id,
      type: procedure.procedure_type,
      userId
    });

    res.status(201).json(procedure);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error documenting procedure', { error: err.message });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    res.status(500).json({ error: 'Failed to document procedure' });
  }
});

/**
 * GET /api/procedures/encounter/:encounterId
 * Get all procedures for an encounter
 */
router.get('/encounter/:encounterId', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { encounterId } = req.params;

    if (!encounterId || !z.string().uuid().safeParse(encounterId).success) {
      return res.status(400).json({ error: 'Invalid encounter ID' });
    }

    const procedures = await ProcedureTemplateService.getProceduresForEncounter(
      tenantId,
      encounterId
    );

    res.json({ procedures });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching encounter procedures', {
      error: err.message,
      encounterId: req.params.encounterId
    });
    res.status(500).json({ error: 'Failed to fetch procedures' });
  }
});

/**
 * GET /api/procedures/:id
 * Get specific procedure by ID
 */
router.get('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const procedure = await ProcedureTemplateService.getProcedureById(tenantId, id!);

    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    res.json(procedure);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching procedure', {
      error: err.message,
      procedureId: req.params.id!
    });
    res.status(500).json({ error: 'Failed to fetch procedure' });
  }
});

/**
 * PUT /api/procedures/:id
 * Update procedure documentation
 */
router.put('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const validated = updateProcedureSchema.parse(req.body);

    // Convert datetime strings to Date objects
    const updates: Partial<ProcedureDocumentationInput> = {
      ...validated,
      procedure_start_time: validated.procedure_start_time
        ? new Date(validated.procedure_start_time)
        : undefined,
      procedure_end_time: validated.procedure_end_time
        ? new Date(validated.procedure_end_time)
        : undefined
    };

    const procedure = await ProcedureTemplateService.updateProcedure(
      tenantId,
      id!,
      updates
    );

    logger.info('Procedure updated', {
      procedureId: id,
      userId: req.user!.id
    });

    res.json(procedure);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error updating procedure', {
      error: err.message,
      procedureId: req.params.id
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    if (err.message === 'Procedure documentation not found') {
      return res.status(404).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to update procedure' });
  }
});

/**
 * DELETE /api/procedures/:id
 * Soft delete procedure documentation
 */
router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    await ProcedureTemplateService.deleteProcedure(tenantId, id!);

    logger.info('Procedure deleted', {
      procedureId: id,
      userId: req.user!.id
    });

    res.status(204).send();
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error deleting procedure', {
      error: err.message,
      procedureId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete procedure' });
  }
});

/**
 * POST /api/procedures/:id/generate-note
 * Generate formatted procedure note
 */
router.post('/:id/generate-note', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const note = await ProcedureTemplateService.generateProcedureNote(tenantId, id!);

    res.json({ note });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error generating procedure note', {
      error: err.message,
      procedureId: req.params.id
    });

    if (err.message === 'Procedure documentation not found') {
      return res.status(404).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to generate procedure note' });
  }
});

/**
 * POST /api/procedures/:id/link-pathology
 * Link procedure to pathology order
 */
router.post('/:id/link-pathology', async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const validated = linkPathologySchema.parse(req.body);

    const procedure = await ProcedureTemplateService.linkToPathology(
      tenantId,
      id!,
      validated.pathology_order_id
    );

    logger.info('Procedure linked to pathology', {
      procedureId: id,
      pathologyOrderId: validated.pathology_order_id,
      userId: req.user!.id
    });

    res.json(procedure);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error linking procedure to pathology', {
      error: err.message,
      procedureId: req.params.id
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    if (err.message === 'Procedure documentation not found') {
      return res.status(404).json({ error: err.message });
    }

    res.status(500).json({ error: 'Failed to link procedure to pathology' });
  }
});

/**
 * POST /api/procedures/:id/supplies
 * Add supplies to procedure
 */
router.post('/:id/supplies', async (req: AuthedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!z.string().uuid().safeParse(id).success) {
      return res.status(400).json({ error: 'Invalid procedure ID' });
    }

    const suppliesSchema = z.array(z.object({
      supply_name: z.string(),
      quantity: z.number().int().positive().default(1),
      lot_number: z.string().optional(),
      expiration_date: z.string().optional(),
      inventory_item_id: z.string().uuid().optional()
    }));

    const validated = suppliesSchema.parse(req.body);

    const supplies = await ProcedureTemplateService.addSupplies(
      id!,
      validated.map(s => ({
        ...s,
        expiration_date: s.expiration_date ? new Date(s.expiration_date) : undefined
      }))
    );

    res.status(201).json({ supplies });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error adding procedure supplies', {
      error: err.message,
      procedureId: req.params.id
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.issues
      });
    }

    res.status(500).json({ error: 'Failed to add supplies' });
  }
});

export { router as procedureTemplatesRouter };
