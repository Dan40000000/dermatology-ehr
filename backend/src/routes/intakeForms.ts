/**
 * Intake Forms API Routes
 * Handles digital pre-visit intake form operations:
 * - Form template management
 * - Form assignment to appointments/patients
 * - Patient form access (public routes with token)
 * - Response submission and progress saving
 * - Chart import
 * - Completion status tracking
 */

import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { logger } from '../lib/logger';
import { intakeFormService } from '../services/intakeFormService';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const assignFormSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  templateId: z.string().uuid(),
  dueBy: z.string().datetime().optional(),
  sendMethod: z.enum(['email', 'sms', 'both', 'portal_only']).optional(),
});

const saveProgressSchema = z.object({
  sectionId: z.string().uuid(),
  responses: z.record(z.string(), z.unknown()),
  repeatIndex: z.number().int().min(0).optional(),
  isComplete: z.boolean().optional(),
});

const submitFormSchema = z.object({
  responses: z.array(z.object({
    sectionId: z.string().uuid(),
    fieldResponses: z.record(z.string(), z.unknown()),
    repeatIndex: z.number().int().min(0).optional(),
  })),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  formType: z.enum(['new_patient', 'returning', 'procedure_specific']),
  procedureType: z.string().optional(),
  isDefault: z.boolean().optional(),
  sendDaysBeforeAppointment: z.number().int().min(0).max(30).optional(),
  dueHoursBeforeAppointment: z.number().int().min(0).max(168).optional(),
});

// ============================================================================
// AUTHENTICATED ROUTES (Staff/Admin)
// ============================================================================

/**
 * GET /api/intake-forms/templates
 * List all intake form templates
 */
router.get('/templates', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const activeOnly = req.query.active !== 'false';

    const templates = await intakeFormService.getTemplates(tenantId, activeOnly);

    // Get section counts for each template
    const templatesWithCounts = await Promise.all(
      templates.map(async (template) => {
        const countResult = await pool.query(
          `SELECT COUNT(*) as section_count FROM intake_form_sections WHERE template_id = $1`,
          [template.id]
        );
        return {
          ...template,
          sectionCount: parseInt(countResult.rows[0]?.section_count || '0'),
        };
      })
    );

    res.json({ templates: templatesWithCounts });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching intake templates', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * POST /api/intake-forms/templates
 * Create a new intake form template
 */
router.post(
  '/templates',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const parsed = createTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { name, description, formType, procedureType, isDefault, sendDaysBeforeAppointment, dueHoursBeforeAppointment } = parsed.data;

      // If setting as default, unset other defaults of same type
      if (isDefault) {
        await pool.query(
          `UPDATE intake_form_templates SET is_default = false WHERE tenant_id = $1 AND form_type = $2`,
          [tenantId, formType]
        );
      }

      const result = await pool.query(
        `INSERT INTO intake_form_templates (
          tenant_id, name, description, form_type, procedure_type, is_default,
          send_days_before_appointment, due_hours_before_appointment, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          tenantId,
          name,
          description || null,
          formType,
          procedureType || null,
          isDefault || false,
          sendDaysBeforeAppointment || 3,
          dueHoursBeforeAppointment || 24,
          userId,
        ]
      );

      logger.info('Intake template created', { templateId: result.rows[0]?.id, userId });

      res.status(201).json(result.rows[0]);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error creating intake template', { error: err.message });
      res.status(500).json({ error: 'Failed to create template' });
    }
  }
);

/**
 * POST /api/intake-forms/templates/default
 * Create default template with all standard dermatology sections
 */
router.post(
  '/templates/default',
  requireAuth,
  requireRoles(['admin']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { formType = 'new_patient' } = req.body;

      const template = await intakeFormService.createDefaultTemplate(
        tenantId,
        formType,
        userId
      );

      logger.info('Default intake template created', { templateId: template.id, formType });

      res.status(201).json(template);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error creating default template', { error: err.message });
      res.status(500).json({ error: 'Failed to create default template' });
    }
  }
);

/**
 * GET /api/intake-forms/templates/:id
 * Get template with all sections
 */
router.get('/templates/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const templateResult = await pool.query(
      `SELECT * FROM intake_form_templates WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const sectionsResult = await pool.query(
      `SELECT * FROM intake_form_sections WHERE template_id = $1 ORDER BY section_order`,
      [id]
    );

    res.json({
      template: templateResult.rows[0],
      sections: sectionsResult.rows,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching template', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/intake-forms/assign
 * Assign a form to a patient/appointment
 */
router.post(
  '/assign',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;

      const parsed = assignFormSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
      }

      const { appointmentId, patientId, templateId, dueBy, sendMethod } = parsed.data;

      // Verify patient exists
      const patientResult = await pool.query(
        `SELECT id FROM patients WHERE id = $1 AND tenant_id = $2`,
        [patientId, tenantId]
      );

      if (patientResult.rows.length === 0) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const assignment = await intakeFormService.assignForm({
        tenantId,
        appointmentId,
        patientId,
        templateId,
        dueBy: dueBy ? new Date(dueBy) : undefined,
        sendMethod,
        createdBy: userId,
      });

      logger.info('Intake form assigned', { assignmentId: assignment.id, patientId, userId });

      res.status(201).json(assignment);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error assigning intake form', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to assign form' });
    }
  }
);

/**
 * POST /api/intake-forms/:assignmentId/send
 * Send form link to patient
 */
router.post(
  '/:assignmentId/send',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { assignmentId } = req.params;

      const result = await intakeFormService.sendFormLink(assignmentId!, tenantId);

      logger.info('Intake form link sent', { assignmentId, sentVia: result.sentVia });

      res.json(result);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error sending form link', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to send form link' });
    }
  }
);

/**
 * GET /api/intake-forms/appointment/:id/status
 * Get completion status for an appointment
 */
router.get('/appointment/:id/status', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const status = await intakeFormService.getCompletionStatus(id!, tenantId);

    res.json(status);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching completion status', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch completion status' });
  }
});

/**
 * POST /api/intake-forms/:assignmentId/import
 * Import form responses to patient chart
 */
router.post(
  '/:assignmentId/import',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.id;
      const { assignmentId } = req.params;

      const result = await intakeFormService.importToChart(assignmentId!, tenantId, userId);

      logger.info('Intake form imported to chart', { assignmentId, importId: result.importId });

      res.json(result);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error importing to chart', { error: err.message });
      res.status(500).json({ error: err.message || 'Failed to import to chart' });
    }
  }
);

/**
 * GET /api/intake-forms/pending
 * Get pending intake forms (for dashboard)
 */
router.get(
  '/pending',
  requireAuth,
  requireRoles(['admin', 'provider', 'ma', 'front_desk']),
  async (req: AuthedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { date, limit, offset } = req.query;

      const result = await intakeFormService.getPendingAssignments(tenantId, {
        date: date as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Error fetching pending assignments', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch pending assignments' });
    }
  }
);

/**
 * GET /api/intake-forms/:assignmentId
 * Get assignment details (staff view)
 */
router.get('/:assignmentId', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { assignmentId } = req.params;

    const assignmentResult = await pool.query(
      `SELECT a.*, t.name as template_name, t.form_type,
              p.first_name, p.last_name, p.mrn, p.email, p.cell_phone,
              app.start_time as appointment_time
       FROM intake_form_assignments a
       JOIN intake_form_templates t ON a.template_id = t.id
       JOIN patients p ON a.patient_id = p.id
       LEFT JOIN appointments app ON a.appointment_id = app.id
       WHERE a.id = $1 AND a.tenant_id = $2`,
      [assignmentId, tenantId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Get responses
    const responsesResult = await pool.query(
      `SELECT r.*, s.section_name, s.section_key, s.title
       FROM intake_form_responses r
       JOIN intake_form_sections s ON r.section_id = s.id
       WHERE r.assignment_id = $1
       ORDER BY s.section_order`,
      [assignmentId]
    );

    res.json({
      assignment: assignmentResult.rows[0],
      responses: responsesResult.rows,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching assignment', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// ============================================================================
// PUBLIC ROUTES (Patient Access via Token)
// ============================================================================

/**
 * GET /api/intake-forms/form/:token
 * Get form for patient (public, no auth required)
 */
router.get('/form/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const result = await intakeFormService.getFormByToken(token!);

    if (!result.valid) {
      return res.status(404).json({ error: 'Form not found or expired' });
    }

    // Don't expose internal IDs in public response
    res.json({
      formId: result.assignment?.id,
      templateName: result.template?.name,
      sections: result.sections?.map((section) => ({
        id: section.id,
        name: section.sectionName,
        key: section.sectionKey,
        order: section.sectionOrder,
        title: section.title,
        description: section.description,
        instructions: section.instructions,
        fields: section.fields,
        conditionalLogic: section.conditionalLogic,
        isRequired: section.isRequired,
        isRepeatable: section.isRepeatable,
        maxRepeats: section.maxRepeats,
      })),
      patientData: result.patientData,
      existingResponses: result.existingResponses?.map((r) => ({
        sectionId: r.sectionId,
        fieldResponses: r.fieldResponses,
        repeatIndex: r.repeatIndex,
        isComplete: r.isComplete,
      })),
      status: result.assignment?.status,
      completionPercentage: result.assignment?.completionPercentage,
      dueBy: result.assignment?.dueBy,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching form by token', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

/**
 * POST /api/intake-forms/form/:token/save
 * Save progress on form section (patient, no auth)
 */
router.post('/form/:token/save', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Validate token and get assignment
    const formData = await intakeFormService.getFormByToken(token!);

    if (!formData.valid || !formData.assignment) {
      return res.status(404).json({ error: 'Form not found or expired' });
    }

    const parsed = saveProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
    }

    const { sectionId, responses, repeatIndex, isComplete } = parsed.data;

    const response = await intakeFormService.saveProgress({
      assignmentId: formData.assignment.id,
      sectionId,
      responses,
      repeatIndex,
      isComplete,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      saved: true,
      response: {
        sectionId: response.sectionId,
        isComplete: response.isComplete,
        lastSavedAt: response.lastSavedAt,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error saving form progress', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to save progress' });
  }
});

/**
 * POST /api/intake-forms/form/:token/submit
 * Submit completed form (patient, no auth)
 */
router.post('/form/:token/submit', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    // Validate token and get assignment
    const formData = await intakeFormService.getFormByToken(token!);

    if (!formData.valid || !formData.assignment) {
      return res.status(404).json({ error: 'Form not found or expired' });
    }

    const parsed = submitFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.format() });
    }

    const { responses } = parsed.data;

    // Save all section responses
    for (const sectionResponse of responses) {
      await intakeFormService.saveProgress({
        assignmentId: formData.assignment.id,
        sectionId: sectionResponse.sectionId,
        responses: sectionResponse.fieldResponses,
        repeatIndex: sectionResponse.repeatIndex,
        isComplete: true,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
    }

    // Complete the form
    const result = await intakeFormService.completeForm(
      formData.assignment.id,
      formData.assignment.tenantId
    );

    logger.info('Intake form submitted by patient', {
      assignmentId: formData.assignment.id,
      patientId: formData.assignment.patientId,
    });

    res.json({
      success: true,
      completedAt: result.completedAt,
      message: 'Thank you! Your intake form has been submitted successfully.',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error submitting form', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to submit form' });
  }
});

export const intakeFormsRouter = router;
