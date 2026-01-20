/**
 * AI Agent Configuration Routes
 *
 * CRUD API for managing customizable AI agent configurations per office
 * Allows practices to create specialized note templates for different visit types
 */

import { Router } from 'express';
import { z } from 'zod';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';
import { agentConfigService, CreateAgentConfigInput } from '../services/agentConfigService';
import { auditLog } from '../services/audit';
import { logger } from '../lib/logger';

export const aiAgentConfigsRouter = Router();

// Validation schemas
const createConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  appointmentTypeId: z.string().optional(),
  specialtyFocus: z.enum(['medical_derm', 'cosmetic', 'mohs', 'pediatric_derm', 'general']).optional(),
  aiModel: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(100).max(16000).optional(),
  systemPrompt: z.string().min(10),
  promptTemplate: z.string().min(10),
  noteSections: z.array(z.string()).min(1),
  sectionPrompts: z.record(z.string(), z.string()).optional(),
  outputFormat: z.enum(['soap', 'narrative', 'procedure_note']).optional(),
  verbosityLevel: z.enum(['concise', 'standard', 'detailed']).optional(),
  includeCodes: z.boolean().optional(),
  terminologySet: z.record(z.string(), z.array(z.string())).optional(),
  focusAreas: z.array(z.string()).optional(),
  defaultCptCodes: z.array(z.object({
    code: z.string(),
    description: z.string(),
  })).optional(),
  defaultIcd10Codes: z.array(z.object({
    code: z.string(),
    description: z.string(),
  })).optional(),
  defaultFollowUpInterval: z.string().optional(),
  taskTemplates: z.array(z.object({
    task: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    daysFromVisit: z.number(),
  })).optional(),
});

const updateConfigSchema = createConfigSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * @swagger
 * /api/ai-agent-configs:
 *   get:
 *     summary: List AI agent configurations
 *     description: Retrieve all AI agent configurations for the tenant with optional filters.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: activeOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filter to only active configurations
 *       - in: query
 *         name: specialtyFocus
 *         schema:
 *           type: string
 *           enum: [medical_derm, cosmetic, mohs, pediatric_derm, general]
 *         description: Filter by specialty focus
 *       - in: query
 *         name: appointmentTypeId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by appointment type
 *     responses:
 *       200:
 *         description: List of AI agent configurations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configurations:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to list configurations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { activeOnly, specialtyFocus, appointmentTypeId } = req.query;

    const configs = await agentConfigService.getConfigurations(tenantId, {
      activeOnly: activeOnly !== 'false',
      specialtyFocus: specialtyFocus as string | undefined,
      appointmentTypeId: appointmentTypeId as string | undefined,
    });

    return res.json({ configurations: configs });
  } catch (error: any) {
    logger.error('Failed to list agent configurations', { error: error.message });
    return res.status(500).json({ error: 'Failed to list configurations' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/default:
 *   get:
 *     summary: Get default AI agent configuration
 *     description: Retrieve the default AI agent configuration for the tenant.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: Default configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No default configuration found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get default configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/default', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const config = await agentConfigService.getDefaultConfiguration(tenantId);

    if (!config) {
      return res.status(404).json({ error: 'No default configuration found' });
    }

    return res.json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to get default configuration', { error: error.message });
    return res.status(500).json({ error: 'Failed to get default configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/for-appointment/{appointmentTypeId}:
 *   get:
 *     summary: Get configuration for appointment type
 *     description: Retrieve the AI agent configuration for a specific appointment type.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: appointmentTypeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment type ID
 *     responses:
 *       200:
 *         description: Configuration for appointment type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       400:
 *         description: Appointment type ID is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: No configuration found for this appointment type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/for-appointment/:appointmentTypeId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { appointmentTypeId } = req.params;

    if (!appointmentTypeId) {
      return res.status(400).json({ error: 'Appointment type ID is required' });
    }

    const config = await agentConfigService.getConfigurationForAppointmentType(tenantId, appointmentTypeId);

    if (!config) {
      return res.status(404).json({ error: 'No configuration found for this appointment type' });
    }

    return res.json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to get configuration for appointment type', { error: error.message });
    return res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/{id}:
 *   get:
 *     summary: Get AI agent configuration by ID
 *     description: Retrieve a specific AI agent configuration by its ID.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID
 *     responses:
 *       200:
 *         description: Configuration details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       400:
 *         description: Configuration ID is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    const config = await agentConfigService.getConfiguration(id, tenantId);

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    return res.json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to get configuration', { error: error.message });
    return res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs:
 *   post:
 *     summary: Create AI agent configuration
 *     description: Create a new AI agent configuration. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - systemPrompt
 *               - promptTemplate
 *               - noteSections
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               isDefault:
 *                 type: boolean
 *               appointmentTypeId:
 *                 type: string
 *                 format: uuid
 *               specialtyFocus:
 *                 type: string
 *                 enum: [medical_derm, cosmetic, mohs, pediatric_derm, general]
 *               aiModel:
 *                 type: string
 *               temperature:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 1
 *               maxTokens:
 *                 type: integer
 *                 minimum: 100
 *                 maximum: 16000
 *               systemPrompt:
 *                 type: string
 *                 minLength: 10
 *               promptTemplate:
 *                 type: string
 *                 minLength: 10
 *               noteSections:
 *                 type: array
 *                 items:
 *                   type: string
 *               outputFormat:
 *                 type: string
 *                 enum: [soap, narrative, procedure_note]
 *               verbosityLevel:
 *                 type: string
 *                 enum: [concise, standard, detailed]
 *               includeCodes:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Configuration created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Configuration with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to create configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.post('/', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = createConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    // Validate the configuration
    const validation = agentConfigService.validateConfiguration(parsed.data as CreateAgentConfigInput);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    const config = await agentConfigService.createConfiguration(
      tenantId,
      parsed.data as CreateAgentConfigInput,
      userId
    );

    await auditLog(tenantId, userId, 'ai_agent_config_create', 'ai_agent_configuration', config.id);

    logger.info('Created AI agent configuration', { configId: config.id, name: config.name, tenantId });

    return res.status(201).json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to create agent configuration', { error: error.message });

    if (error.message.includes('unique constraint')) {
      return res.status(409).json({ error: 'A configuration with this name already exists' });
    }

    return res.status(500).json({ error: 'Failed to create configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/{id}:
 *   put:
 *     summary: Update AI agent configuration
 *     description: Update an existing AI agent configuration. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               isDefault:
 *                 type: boolean
 *               systemPrompt:
 *                 type: string
 *               promptTemplate:
 *                 type: string
 *               noteSections:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to update configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     summary: Delete AI agent configuration
 *     description: Delete (deactivate) an AI agent configuration. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID
 *     responses:
 *       200:
 *         description: Configuration deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Configuration ID is required or cannot delete default
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to delete configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.put('/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    const config = await agentConfigService.updateConfiguration(id, tenantId, parsed.data, userId);

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    await auditLog(tenantId, userId, 'ai_agent_config_update', 'ai_agent_configuration', config.id);

    logger.info('Updated AI agent configuration', { configId: config.id, tenantId });

    return res.json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to update agent configuration', { error: error.message });
    return res.status(500).json({ error: 'Failed to update configuration' });
  }
});

aiAgentConfigsRouter.delete('/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    const deleted = await agentConfigService.deleteConfiguration(id, tenantId);

    if (!deleted) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    await auditLog(tenantId, userId, 'ai_agent_config_delete', 'ai_agent_configuration', id);

    logger.info('Deleted AI agent configuration', { configId: id, tenantId });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete agent configuration', { error: error.message });

    if (error.message.includes('default')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/{id}/clone:
 *   post:
 *     summary: Clone AI agent configuration
 *     description: Clone an existing configuration with a new name. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID to clone
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *     responses:
 *       201:
 *         description: Configuration cloned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configuration:
 *                   type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Original configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Configuration with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to clone configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.post('/:id/clone', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    if (!name || typeof name !== 'string' || name.length < 1) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const config = await agentConfigService.cloneConfiguration(id, tenantId, name, userId);

    if (!config) {
      return res.status(404).json({ error: 'Original configuration not found' });
    }

    await auditLog(tenantId, userId, 'ai_agent_config_clone', 'ai_agent_configuration', config.id);

    logger.info('Cloned AI agent configuration', { originalId: id, newId: config.id, tenantId });

    return res.status(201).json({ configuration: config });
  } catch (error: any) {
    logger.error('Failed to clone agent configuration', { error: error.message });

    if (error.message.includes('unique constraint')) {
      return res.status(409).json({ error: 'A configuration with this name already exists' });
    }

    return res.status(500).json({ error: 'Failed to clone configuration' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/{id}/versions:
 *   get:
 *     summary: Get configuration version history
 *     description: Retrieve version history for an AI agent configuration. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID
 *     responses:
 *       200:
 *         description: Version history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Configuration ID is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get version history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/:id/versions', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    const versions = await agentConfigService.getVersionHistory(id, tenantId);

    return res.json({ versions });
  } catch (error: any) {
    logger.error('Failed to get configuration versions', { error: error.message });
    return res.status(500).json({ error: 'Failed to get version history' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/analytics/summary:
 *   get:
 *     summary: Get configuration analytics
 *     description: Retrieve analytics for AI agent configurations. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: query
 *         name: configId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by configuration ID
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by provider ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics range
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics range
 *     responses:
 *       200:
 *         description: Analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analytics:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get analytics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.get('/analytics/summary', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { configId, providerId, startDate, endDate } = req.query;

    const analytics = await agentConfigService.getAnalytics(tenantId, {
      configId: configId as string | undefined,
      providerId: providerId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    return res.json({ analytics });
  } catch (error: any) {
    logger.error('Failed to get analytics', { error: error.message });
    return res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * @swagger
 * /api/ai-agent-configs/{id}/test:
 *   post:
 *     summary: Test AI agent configuration
 *     description: Test a configuration with a sample transcript. Admin only.
 *     tags:
 *       - AI Agent Configs
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Configuration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sampleTranscript
 *             properties:
 *               sampleTranscript:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 configName:
 *                   type: string
 *                 noteSections:
 *                   type: array
 *                   items:
 *                     type: string
 *                 previewPrompt:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Configuration not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to test configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiAgentConfigsRouter.post('/:id/test', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { sampleTranscript } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Configuration ID is required' });
    }

    if (!sampleTranscript || typeof sampleTranscript !== 'string') {
      return res.status(400).json({ error: 'Sample transcript is required' });
    }

    const config = await agentConfigService.getConfiguration(id, tenantId);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    // For now, return a preview of what the prompt would look like
    // In production, you could actually run this through the AI model
    const previewPrompt = `${config.systemPrompt}\n\n${config.promptTemplate}\n\nSAMPLE TRANSCRIPT:\n${sampleTranscript}`;

    return res.json({
      configName: config.name,
      noteSections: config.noteSections,
      previewPrompt: previewPrompt.substring(0, 2000) + '...',
      message: 'Configuration is valid. Full AI generation would use this prompt template.',
    });
  } catch (error: any) {
    logger.error('Failed to test configuration', { error: error.message });
    return res.status(500).json({ error: 'Failed to test configuration' });
  }
});
