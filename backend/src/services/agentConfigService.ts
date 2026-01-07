/**
 * AI Agent Configuration Service
 *
 * Manages customizable AI agent configurations for different visit types
 * Allows offices to create specialized note templates for:
 * - Medical Dermatology
 * - Cosmetic Consultations
 * - Mohs Surgery
 * - Pediatric Dermatology
 * - Custom configurations
 */

import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// Types
export interface AgentConfiguration {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  appointmentTypeId?: string;
  specialtyFocus?: string;

  // AI Model settings
  aiModel: string;
  temperature: number;
  maxTokens: number;

  // Prompts
  systemPrompt: string;
  promptTemplate: string;

  // Note structure
  noteSections: string[];
  sectionPrompts: Record<string, string>;

  // Output formatting
  outputFormat: string;
  verbosityLevel: string;
  includeCodes: boolean;

  // Terminology
  terminologySet: Record<string, string[]>;
  focusAreas: string[];

  // Code suggestions
  defaultCptCodes: Array<{ code: string; description: string }>;
  defaultIcd10Codes: Array<{ code: string; description: string }>;

  // Follow-up
  defaultFollowUpInterval?: string;
  taskTemplates: Array<{ task: string; priority: string; daysFromVisit: number }>;

  // Metadata
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAgentConfigInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  appointmentTypeId?: string;
  specialtyFocus?: string;
  aiModel?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt: string;
  promptTemplate: string;
  noteSections: string[];
  sectionPrompts?: Record<string, string>;
  outputFormat?: string;
  verbosityLevel?: string;
  includeCodes?: boolean;
  terminologySet?: Record<string, string[]>;
  focusAreas?: string[];
  defaultCptCodes?: Array<{ code: string; description: string }>;
  defaultIcd10Codes?: Array<{ code: string; description: string }>;
  defaultFollowUpInterval?: string;
  taskTemplates?: Array<{ task: string; priority: string; daysFromVisit: number }>;
}

export interface UpdateAgentConfigInput extends Partial<CreateAgentConfigInput> {
  isActive?: boolean;
}

class AgentConfigService {
  /**
   * Get all agent configurations for a tenant
   */
  async getConfigurations(
    tenantId: string,
    options?: { activeOnly?: boolean; specialtyFocus?: string; appointmentTypeId?: string }
  ): Promise<AgentConfiguration[]> {
    let query = `
      SELECT * FROM ai_agent_configurations
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (options?.activeOnly !== false) {
      query += ` AND is_active = true`;
    }

    if (options?.specialtyFocus) {
      query += ` AND specialty_focus = $${paramIndex}`;
      params.push(options.specialtyFocus);
      paramIndex++;
    }

    if (options?.appointmentTypeId) {
      query += ` AND appointment_type_id = $${paramIndex}`;
      params.push(options.appointmentTypeId);
    }

    query += ` ORDER BY is_default DESC, name ASC`;

    const result = await pool.query(query, params);
    return result.rows.map(this.mapRowToConfig);
  }

  /**
   * Get a specific agent configuration by ID
   */
  async getConfiguration(configId: string, tenantId: string): Promise<AgentConfiguration | null> {
    const result = await pool.query(
      `SELECT * FROM ai_agent_configurations WHERE id = $1 AND tenant_id = $2`,
      [configId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Get the default configuration for a tenant
   */
  async getDefaultConfiguration(tenantId: string): Promise<AgentConfiguration | null> {
    const result = await pool.query(
      `SELECT * FROM ai_agent_configurations
       WHERE tenant_id = $1 AND is_default = true AND is_active = true
       LIMIT 1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // Return the first active config if no default set
      const fallback = await pool.query(
        `SELECT * FROM ai_agent_configurations
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY created_at ASC
         LIMIT 1`,
        [tenantId]
      );
      return fallback.rows.length > 0 ? this.mapRowToConfig(fallback.rows[0]) : null;
    }

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Get configuration appropriate for an appointment type
   */
  async getConfigurationForAppointmentType(
    tenantId: string,
    appointmentTypeId: string
  ): Promise<AgentConfiguration | null> {
    // First try to find one linked to this appointment type
    const result = await pool.query(
      `SELECT * FROM ai_agent_configurations
       WHERE tenant_id = $1 AND appointment_type_id = $2 AND is_active = true
       LIMIT 1`,
      [tenantId, appointmentTypeId]
    );

    if (result.rows.length > 0) {
      return this.mapRowToConfig(result.rows[0]);
    }

    // Fall back to default
    return this.getDefaultConfiguration(tenantId);
  }

  /**
   * Create a new agent configuration
   */
  async createConfiguration(
    tenantId: string,
    input: CreateAgentConfigInput,
    createdBy?: string
  ): Promise<AgentConfiguration> {
    const id = crypto.randomUUID();

    // If setting as default, unset any existing default
    if (input.isDefault) {
      await pool.query(
        `UPDATE ai_agent_configurations SET is_default = false WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    const result = await pool.query(
      `INSERT INTO ai_agent_configurations (
        id, tenant_id, name, description, is_default, is_active,
        appointment_type_id, specialty_focus,
        ai_model, temperature, max_tokens,
        system_prompt, prompt_template,
        note_sections, section_prompts,
        output_format, verbosity_level, include_codes,
        terminology_set, focus_areas,
        default_cpt_codes, default_icd10_codes,
        default_follow_up_interval, task_templates,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, true,
        $6, $7,
        $8, $9, $10,
        $11, $12,
        $13, $14,
        $15, $16, $17,
        $18, $19,
        $20, $21,
        $22, $23,
        $24
      )
      RETURNING *`,
      [
        id,
        tenantId,
        input.name,
        input.description || null,
        input.isDefault || false,
        input.appointmentTypeId || null,
        input.specialtyFocus || null,
        input.aiModel || 'claude-3-5-sonnet-20241022',
        input.temperature ?? 0.3,
        input.maxTokens ?? 4000,
        input.systemPrompt,
        input.promptTemplate,
        JSON.stringify(input.noteSections),
        JSON.stringify(input.sectionPrompts || {}),
        input.outputFormat || 'soap',
        input.verbosityLevel || 'standard',
        input.includeCodes ?? true,
        JSON.stringify(input.terminologySet || {}),
        JSON.stringify(input.focusAreas || []),
        JSON.stringify(input.defaultCptCodes || []),
        JSON.stringify(input.defaultIcd10Codes || []),
        input.defaultFollowUpInterval || null,
        JSON.stringify(input.taskTemplates || []),
        createdBy || null,
      ]
    );

    logger.info('Created AI agent configuration', { id, tenantId, name: input.name });

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Update an existing agent configuration
   */
  async updateConfiguration(
    configId: string,
    tenantId: string,
    input: UpdateAgentConfigInput,
    updatedBy?: string
  ): Promise<AgentConfiguration | null> {
    // Get current config for version history
    const current = await this.getConfiguration(configId, tenantId);
    if (!current) {
      return null;
    }

    // If setting as default, unset any existing default
    if (input.isDefault) {
      await pool.query(
        `UPDATE ai_agent_configurations SET is_default = false WHERE tenant_id = $1 AND id != $2`,
        [tenantId, configId]
      );
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const addUpdate = (field: string, value: any, jsonStringify = false) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        params.push(jsonStringify ? JSON.stringify(value) : value);
        paramIndex++;
      }
    };

    addUpdate('name', input.name);
    addUpdate('description', input.description);
    addUpdate('is_default', input.isDefault);
    addUpdate('is_active', input.isActive);
    addUpdate('appointment_type_id', input.appointmentTypeId);
    addUpdate('specialty_focus', input.specialtyFocus);
    addUpdate('ai_model', input.aiModel);
    addUpdate('temperature', input.temperature);
    addUpdate('max_tokens', input.maxTokens);
    addUpdate('system_prompt', input.systemPrompt);
    addUpdate('prompt_template', input.promptTemplate);
    addUpdate('note_sections', input.noteSections, true);
    addUpdate('section_prompts', input.sectionPrompts, true);
    addUpdate('output_format', input.outputFormat);
    addUpdate('verbosity_level', input.verbosityLevel);
    addUpdate('include_codes', input.includeCodes);
    addUpdate('terminology_set', input.terminologySet, true);
    addUpdate('focus_areas', input.focusAreas, true);
    addUpdate('default_cpt_codes', input.defaultCptCodes, true);
    addUpdate('default_icd10_codes', input.defaultIcd10Codes, true);
    addUpdate('default_follow_up_interval', input.defaultFollowUpInterval);
    addUpdate('task_templates', input.taskTemplates, true);

    if (updates.length === 0) {
      return current;
    }

    // Save version history
    await this.saveVersionHistory(configId, current, updatedBy);

    // Execute update
    params.push(configId);
    params.push(tenantId);

    const result = await pool.query(
      `UPDATE ai_agent_configurations
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info('Updated AI agent configuration', { configId, tenantId });

    return this.mapRowToConfig(result.rows[0]);
  }

  /**
   * Delete (deactivate) an agent configuration
   */
  async deleteConfiguration(configId: string, tenantId: string): Promise<boolean> {
    // Check if this is the default - can't delete default
    const config = await this.getConfiguration(configId, tenantId);
    if (!config) {
      return false;
    }

    if (config.isDefault) {
      throw new Error('Cannot delete the default configuration. Set another as default first.');
    }

    // Soft delete - set inactive
    const result = await pool.query(
      `UPDATE ai_agent_configurations SET is_active = false WHERE id = $1 AND tenant_id = $2`,
      [configId, tenantId]
    );

    logger.info('Deactivated AI agent configuration', { configId, tenantId });

    return (result.rowCount || 0) > 0;
  }

  /**
   * Clone an existing configuration
   */
  async cloneConfiguration(
    configId: string,
    tenantId: string,
    newName: string,
    createdBy?: string
  ): Promise<AgentConfiguration | null> {
    const original = await this.getConfiguration(configId, tenantId);
    if (!original) {
      return null;
    }

    const input: CreateAgentConfigInput = {
      name: newName,
      description: `Cloned from "${original.name}"`,
      isDefault: false,
      appointmentTypeId: original.appointmentTypeId,
      specialtyFocus: original.specialtyFocus,
      aiModel: original.aiModel,
      temperature: original.temperature,
      maxTokens: original.maxTokens,
      systemPrompt: original.systemPrompt,
      promptTemplate: original.promptTemplate,
      noteSections: original.noteSections,
      sectionPrompts: original.sectionPrompts,
      outputFormat: original.outputFormat,
      verbosityLevel: original.verbosityLevel,
      includeCodes: original.includeCodes,
      terminologySet: original.terminologySet,
      focusAreas: original.focusAreas,
      defaultCptCodes: original.defaultCptCodes,
      defaultIcd10Codes: original.defaultIcd10Codes,
      defaultFollowUpInterval: original.defaultFollowUpInterval,
      taskTemplates: original.taskTemplates,
    };

    return this.createConfiguration(tenantId, input, createdBy);
  }

  /**
   * Save version history for audit trail
   */
  private async saveVersionHistory(
    configId: string,
    config: AgentConfiguration,
    changedBy?: string
  ): Promise<void> {
    // Get next version number
    const versionResult = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
       FROM ai_agent_config_versions WHERE config_id = $1`,
      [configId]
    );
    const nextVersion = versionResult.rows[0].next_version;

    await pool.query(
      `INSERT INTO ai_agent_config_versions (id, config_id, version_number, config_snapshot, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        crypto.randomUUID(),
        configId,
        nextVersion,
        JSON.stringify(config),
        changedBy || null,
      ]
    );
  }

  /**
   * Get version history for a configuration
   */
  async getVersionHistory(
    configId: string,
    tenantId: string
  ): Promise<Array<{ versionNumber: number; configSnapshot: AgentConfiguration; changedBy?: string; createdAt: Date }>> {
    // Verify config belongs to tenant
    const config = await this.getConfiguration(configId, tenantId);
    if (!config) {
      return [];
    }

    const result = await pool.query(
      `SELECT version_number, config_snapshot, changed_by, created_at
       FROM ai_agent_config_versions
       WHERE config_id = $1
       ORDER BY version_number DESC`,
      [configId]
    );

    return result.rows.map((row) => ({
      versionNumber: row.version_number,
      configSnapshot: row.config_snapshot,
      changedBy: row.changed_by,
      createdAt: row.created_at,
    }));
  }

  /**
   * Record usage analytics for an agent configuration
   */
  async recordUsage(
    tenantId: string,
    agentConfigId: string,
    providerId: string | null,
    metrics: {
      generated?: boolean;
      approved?: boolean;
      rejected?: boolean;
      confidenceScore?: number;
      editCount?: number;
      generationTimeMs?: number;
      reviewTimeSeconds?: number;
    }
  ): Promise<void> {
    const today = new Date();
    const periodStart = new Date(today.getFullYear(), today.getMonth(), 1); // First of month
    const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last of month

    // Upsert analytics record
    await pool.query(
      `INSERT INTO ai_agent_usage_analytics (
        id, tenant_id, agent_config_id, provider_id,
        notes_generated, notes_approved, notes_rejected,
        avg_confidence_score, avg_edit_count,
        avg_generation_time_ms, avg_review_time_seconds,
        period_start, period_end
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13
      )
      ON CONFLICT (tenant_id, agent_config_id, provider_id, period_start)
      DO UPDATE SET
        notes_generated = ai_agent_usage_analytics.notes_generated + EXCLUDED.notes_generated,
        notes_approved = ai_agent_usage_analytics.notes_approved + EXCLUDED.notes_approved,
        notes_rejected = ai_agent_usage_analytics.notes_rejected + EXCLUDED.notes_rejected,
        avg_confidence_score = (
          ai_agent_usage_analytics.avg_confidence_score * ai_agent_usage_analytics.notes_generated +
          COALESCE(EXCLUDED.avg_confidence_score, 0)
        ) / NULLIF(ai_agent_usage_analytics.notes_generated + 1, 0),
        avg_edit_count = (
          ai_agent_usage_analytics.avg_edit_count * ai_agent_usage_analytics.notes_generated +
          COALESCE(EXCLUDED.avg_edit_count, 0)
        ) / NULLIF(ai_agent_usage_analytics.notes_generated + 1, 0),
        updated_at = NOW()`,
      [
        crypto.randomUUID(),
        tenantId,
        agentConfigId,
        providerId,
        metrics.generated ? 1 : 0,
        metrics.approved ? 1 : 0,
        metrics.rejected ? 1 : 0,
        metrics.confidenceScore || null,
        metrics.editCount || null,
        metrics.generationTimeMs || null,
        metrics.reviewTimeSeconds || null,
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
      ]
    );
  }

  /**
   * Get analytics for configurations
   */
  async getAnalytics(
    tenantId: string,
    options?: { configId?: string; providerId?: string; startDate?: Date; endDate?: Date }
  ): Promise<any[]> {
    let query = `
      SELECT
        a.agent_config_id,
        c.name as config_name,
        SUM(a.notes_generated) as total_generated,
        SUM(a.notes_approved) as total_approved,
        SUM(a.notes_rejected) as total_rejected,
        AVG(a.avg_confidence_score) as avg_confidence,
        AVG(a.avg_edit_count) as avg_edits,
        AVG(a.avg_generation_time_ms) as avg_generation_time,
        AVG(a.avg_review_time_seconds) as avg_review_time
      FROM ai_agent_usage_analytics a
      JOIN ai_agent_configurations c ON c.id = a.agent_config_id
      WHERE a.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (options?.configId) {
      query += ` AND a.agent_config_id = $${paramIndex}`;
      params.push(options.configId);
      paramIndex++;
    }

    if (options?.providerId) {
      query += ` AND a.provider_id = $${paramIndex}`;
      params.push(options.providerId);
      paramIndex++;
    }

    if (options?.startDate) {
      query += ` AND a.period_start >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND a.period_end <= $${paramIndex}`;
      params.push(options.endDate);
    }

    query += ` GROUP BY a.agent_config_id, c.name ORDER BY total_generated DESC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Validate agent configuration input
   */
  validateConfiguration(input: CreateAgentConfigInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.name || input.name.trim().length === 0) {
      errors.push('Name is required');
    }

    if (!input.systemPrompt || input.systemPrompt.trim().length === 0) {
      errors.push('System prompt is required');
    }

    if (!input.promptTemplate || input.promptTemplate.trim().length === 0) {
      errors.push('Prompt template is required');
    }

    if (!input.noteSections || input.noteSections.length === 0) {
      errors.push('At least one note section is required');
    }

    if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 1)) {
      errors.push('Temperature must be between 0 and 1');
    }

    if (input.maxTokens !== undefined && (input.maxTokens < 100 || input.maxTokens > 16000)) {
      errors.push('Max tokens must be between 100 and 16000');
    }

    const validOutputFormats = ['soap', 'narrative', 'procedure_note'];
    if (input.outputFormat && !validOutputFormats.includes(input.outputFormat)) {
      errors.push(`Output format must be one of: ${validOutputFormats.join(', ')}`);
    }

    const validVerbosity = ['concise', 'standard', 'detailed'];
    if (input.verbosityLevel && !validVerbosity.includes(input.verbosityLevel)) {
      errors.push(`Verbosity level must be one of: ${validVerbosity.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map database row to AgentConfiguration type
   */
  private mapRowToConfig(row: any): AgentConfiguration {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      isDefault: row.is_default,
      isActive: row.is_active,
      appointmentTypeId: row.appointment_type_id,
      specialtyFocus: row.specialty_focus,
      aiModel: row.ai_model,
      temperature: parseFloat(row.temperature),
      maxTokens: row.max_tokens,
      systemPrompt: row.system_prompt,
      promptTemplate: row.prompt_template,
      noteSections: row.note_sections,
      sectionPrompts: row.section_prompts || {},
      outputFormat: row.output_format,
      verbosityLevel: row.verbosity_level,
      includeCodes: row.include_codes,
      terminologySet: row.terminology_set || {},
      focusAreas: row.focus_areas || [],
      defaultCptCodes: row.default_cpt_codes || [],
      defaultIcd10Codes: row.default_icd10_codes || [],
      defaultFollowUpInterval: row.default_follow_up_interval,
      taskTemplates: row.task_templates || [],
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const agentConfigService = new AgentConfigService();
