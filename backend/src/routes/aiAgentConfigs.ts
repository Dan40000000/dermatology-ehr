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
  sectionPrompts: z.record(z.string()).optional(),
  outputFormat: z.enum(['soap', 'narrative', 'procedure_note']).optional(),
  verbosityLevel: z.enum(['concise', 'standard', 'detailed']).optional(),
  includeCodes: z.boolean().optional(),
  terminologySet: z.record(z.array(z.string())).optional(),
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
 * GET /api/ai-agent-configs
 * List all agent configurations for the tenant
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
 * GET /api/ai-agent-configs/default
 * Get the default configuration for the tenant
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
 * GET /api/ai-agent-configs/for-appointment/:appointmentTypeId
 * Get the configuration for a specific appointment type
 */
aiAgentConfigsRouter.get('/for-appointment/:appointmentTypeId', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { appointmentTypeId } = req.params;

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
 * GET /api/ai-agent-configs/:id
 * Get a specific agent configuration
 */
aiAgentConfigsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

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
 * POST /api/ai-agent-configs
 * Create a new agent configuration (admin only)
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
 * PUT /api/ai-agent-configs/:id
 * Update an agent configuration (admin only)
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

/**
 * DELETE /api/ai-agent-configs/:id
 * Delete (deactivate) an agent configuration (admin only)
 */
aiAgentConfigsRouter.delete('/:id', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;

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
 * POST /api/ai-agent-configs/:id/clone
 * Clone an existing configuration (admin only)
 */
aiAgentConfigsRouter.post('/:id/clone', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;

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
 * GET /api/ai-agent-configs/:id/versions
 * Get version history for a configuration
 */
aiAgentConfigsRouter.get('/:id/versions', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const versions = await agentConfigService.getVersionHistory(id, tenantId);

    return res.json({ versions });
  } catch (error: any) {
    logger.error('Failed to get configuration versions', { error: error.message });
    return res.status(500).json({ error: 'Failed to get version history' });
  }
});

/**
 * GET /api/ai-agent-configs/analytics
 * Get analytics for all configurations
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
 * POST /api/ai-agent-configs/:id/test
 * Test a configuration with sample transcript
 */
aiAgentConfigsRouter.post('/:id/test', requireAuth, requireRoles(['admin']), async (req: AuthedRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { sampleTranscript } = req.body;

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
