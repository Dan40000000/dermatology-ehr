import { pool } from '../../db/pool';
import { logger } from '../../lib/logger';
import { agentConfigService, CreateAgentConfigInput } from '../agentConfigService';
import crypto from 'crypto';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'test-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;

describe('AgentConfigService', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-123';
  const configId = 'config-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfigurations', () => {
    it('should get all configurations for a tenant', async () => {
      const mockRows = [
        {
          id: 'config-1',
          tenant_id: tenantId,
          name: 'Medical Dermatology',
          is_active: true,
          is_default: true,
          ai_model: 'claude-3-5-sonnet-20241022',
          temperature: 0.3,
          max_tokens: 4000,
          system_prompt: 'You are a dermatology expert',
          prompt_template: 'Template',
          note_sections: ['chiefComplaint', 'hpi'],
          section_prompts: {},
          output_format: 'soap',
          verbosity_level: 'standard',
          include_codes: true,
          terminology_set: {},
          focus_areas: [],
          default_cpt_codes: [],
          default_icd10_codes: [],
          task_templates: [],
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockRows });

      const result = await agentConfigService.getConfigurations(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Medical Dermatology');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM ai_agent_configurations'),
        [tenantId]
      );
    });

    it('should filter by activeOnly option', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.getConfigurations(tenantId, { activeOnly: true });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND is_active = true'),
        [tenantId]
      );
    });

    it('should filter by specialtyFocus', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.getConfigurations(tenantId, { specialtyFocus: 'cosmetic' });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND specialty_focus ='),
        [tenantId, 'cosmetic']
      );
    });

    it('should filter by appointmentTypeId', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.getConfigurations(tenantId, { appointmentTypeId: 'appt-123' });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND appointment_type_id ='),
        [tenantId, 'appt-123']
      );
    });
  });

  describe('getConfiguration', () => {
    it('should get a specific configuration by ID', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Test Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'System prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.getConfiguration(configId, tenantId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(configId);
      expect(result?.name).toBe('Test Config');
    });

    it('should return null when configuration not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.getConfiguration('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getDefaultConfiguration', () => {
    it('should get the default configuration', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Default Config',
        is_active: true,
        is_default: true,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'System prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.getDefaultConfiguration(tenantId);

      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
    });

    it('should fallback to first active config if no default', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Fallback Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'System prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.getDefaultConfiguration(tenantId);

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Fallback Config');
    });

    it('should return null when no configurations exist', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.getDefaultConfiguration(tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getConfigurationForAppointmentType', () => {
    it('should get configuration for appointment type', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        appointment_type_id: 'appt-123',
        name: 'Appointment Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'System prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.getConfigurationForAppointmentType(
        tenantId,
        'appt-123'
      );

      expect(result).not.toBeNull();
      expect(result?.appointmentTypeId).toBe('appt-123');
    });

    it('should fallback to default when no appointment-specific config', async () => {
      const mockDefaultRow = {
        id: 'default-id',
        tenant_id: tenantId,
        name: 'Default',
        is_active: true,
        is_default: true,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'System prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockDefaultRow] });

      const result = await agentConfigService.getConfigurationForAppointmentType(
        tenantId,
        'appt-456'
      );

      expect(result).not.toBeNull();
      expect(result?.isDefault).toBe(true);
    });
  });

  describe('createConfiguration', () => {
    it('should create a new configuration', async () => {
      const input: CreateAgentConfigInput = {
        name: 'New Config',
        systemPrompt: 'System prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint', 'hpi'],
      };

      const mockRow = {
        id: 'test-uuid-123',
        tenant_id: tenantId,
        name: input.name,
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: input.systemPrompt,
        prompt_template: input.promptTemplate,
        note_sections: input.noteSections,
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.createConfiguration(tenantId, input, userId);

      expect(result.name).toBe('New Config');
      expect(logger.info).toHaveBeenCalledWith(
        'Created AI agent configuration',
        expect.objectContaining({ id: 'test-uuid-123', tenantId, name: 'New Config' })
      );
    });

    it('should unset existing default when creating new default', async () => {
      const input: CreateAgentConfigInput = {
        name: 'New Default',
        isDefault: true,
        systemPrompt: 'System prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
      };

      const mockRow = {
        id: 'test-uuid-123',
        tenant_id: tenantId,
        name: input.name,
        is_active: true,
        is_default: true,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: input.systemPrompt,
        prompt_template: input.promptTemplate,
        note_sections: input.noteSections,
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.createConfiguration(tenantId, input, userId);

      expect(result.isDefault).toBe(true);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ai_agent_configurations SET is_default = false'),
        [tenantId]
      );
    });

    it('should use default values for optional fields', async () => {
      const input: CreateAgentConfigInput = {
        name: 'Minimal Config',
        systemPrompt: 'System prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
      };

      const mockRow = {
        id: 'test-uuid-123',
        tenant_id: tenantId,
        name: input.name,
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: input.systemPrompt,
        prompt_template: input.promptTemplate,
        note_sections: input.noteSections,
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await agentConfigService.createConfiguration(tenantId, input);

      expect(result.aiModel).toBe('claude-3-5-sonnet-20241022');
      expect(result.temperature).toBe(0.3);
      expect(result.maxTokens).toBe(4000);
    });
  });

  describe('updateConfiguration', () => {
    it('should update an existing configuration', async () => {
      const currentRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Old Name',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Old prompt',
        prompt_template: 'Old template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedRow = {
        ...currentRow,
        name: 'New Name',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [currentRow] })
        .mockResolvedValueOnce({ rows: [{ next_version: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await agentConfigService.updateConfiguration(
        configId,
        tenantId,
        { name: 'New Name' },
        userId
      );

      expect(result?.name).toBe('New Name');
      expect(logger.info).toHaveBeenCalledWith(
        'Updated AI agent configuration',
        expect.objectContaining({ configId, tenantId })
      );
    });

    it('should return null when configuration not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.updateConfiguration(
        'nonexistent',
        tenantId,
        { name: 'New Name' }
      );

      expect(result).toBeNull();
    });

    it('should unset other defaults when setting new default', async () => {
      const currentRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedRow = {
        ...currentRow,
        is_default: true,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [currentRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next_version: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [updatedRow] });

      await agentConfigService.updateConfiguration(configId, tenantId, { isDefault: true });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'UPDATE ai_agent_configurations SET is_default = false WHERE tenant_id'
        ),
        [tenantId, configId]
      );
    });

    it('should return current config when no updates provided', async () => {
      const currentRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [currentRow] });

      const result = await agentConfigService.updateConfiguration(configId, tenantId, {});

      expect(result).toEqual(expect.objectContaining({ id: configId }));
    });
  });

  describe('deleteConfiguration', () => {
    it('should deactivate a configuration', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        is_default: false,
        is_active: true,
        name: 'Config',
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await agentConfigService.deleteConfiguration(configId, tenantId);

      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Deactivated AI agent configuration',
        expect.objectContaining({ configId, tenantId })
      );
    });

    it('should not allow deleting default configuration', async () => {
      const mockRow = {
        id: configId,
        tenant_id: tenantId,
        is_default: true,
        is_active: true,
        name: 'Default Config',
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      await expect(
        agentConfigService.deleteConfiguration(configId, tenantId)
      ).rejects.toThrow('Cannot delete the default configuration. Set another as default first.');
    });

    it('should return false when configuration not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.deleteConfiguration('nonexistent', tenantId);

      expect(result).toBe(false);
    });
  });

  describe('cloneConfiguration', () => {
    it('should clone an existing configuration', async () => {
      const originalRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Original',
        is_default: false,
        is_active: true,
        appointment_type_id: 'appt-123',
        specialty_focus: 'cosmetic',
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const clonedRow = {
        ...originalRow,
        id: 'test-uuid-123',
        name: 'Cloned Config',
        description: 'Cloned from "Original"',
        is_default: false,
      };

      queryMock
        .mockResolvedValueOnce({ rows: [originalRow] })
        .mockResolvedValueOnce({ rows: [clonedRow] });

      const result = await agentConfigService.cloneConfiguration(
        configId,
        tenantId,
        'Cloned Config',
        userId
      );

      expect(result).not.toBeNull();
      expect(result?.name).toBe('Cloned Config');
      expect(result?.isDefault).toBe(false);
    });

    it('should return null when original not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.cloneConfiguration(
        'nonexistent',
        tenantId,
        'Clone'
      );

      expect(result).toBeNull();
    });
  });

  describe('getVersionHistory', () => {
    it('should get version history for a configuration', async () => {
      const mockConfigRow = {
        id: configId,
        tenant_id: tenantId,
        name: 'Config',
        is_active: true,
        is_default: false,
        ai_model: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        max_tokens: 4000,
        system_prompt: 'Prompt',
        prompt_template: 'Template',
        note_sections: ['chiefComplaint'],
        section_prompts: {},
        output_format: 'soap',
        verbosity_level: 'standard',
        include_codes: true,
        terminology_set: {},
        focus_areas: [],
        default_cpt_codes: [],
        default_icd10_codes: [],
        task_templates: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockVersionRows = [
        {
          version_number: 2,
          config_snapshot: { name: 'Version 2' },
          changed_by: 'user-123',
          created_at: new Date(),
        },
        {
          version_number: 1,
          config_snapshot: { name: 'Version 1' },
          changed_by: 'user-456',
          created_at: new Date(),
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockConfigRow] })
        .mockResolvedValueOnce({ rows: mockVersionRows });

      const result = await agentConfigService.getVersionHistory(configId, tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].versionNumber).toBe(2);
      expect(result[1].versionNumber).toBe(1);
    });

    it('should return empty array when config not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await agentConfigService.getVersionHistory('nonexistent', tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('recordUsage', () => {
    it('should record usage analytics', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.recordUsage(tenantId, configId, 'provider-123', {
        generated: true,
        approved: true,
        confidenceScore: 0.95,
        editCount: 2,
        generationTimeMs: 3000,
        reviewTimeSeconds: 60,
      });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ai_agent_usage_analytics'),
        expect.arrayContaining([
          expect.any(String),
          tenantId,
          configId,
          'provider-123',
          1,
          1,
          0,
          0.95,
          2,
          3000,
          60,
          expect.any(String),
          expect.any(String),
        ])
      );
    });

    it('should handle null provider ID', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.recordUsage(tenantId, configId, null, {
        generated: true,
      });

      expect(queryMock).toHaveBeenCalled();
    });
  });

  describe('getAnalytics', () => {
    it('should get analytics for all configurations', async () => {
      const mockRows = [
        {
          agent_config_id: 'config-1',
          config_name: 'Config 1',
          total_generated: '100',
          total_approved: '90',
          total_rejected: '5',
          avg_confidence: '0.92',
          avg_edits: '2.5',
          avg_generation_time: '2500',
          avg_review_time: '45',
        },
      ];

      queryMock.mockResolvedValueOnce({ rows: mockRows });

      const result = await agentConfigService.getAnalytics(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].total_generated).toBe('100');
    });

    it('should filter by config ID', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.getAnalytics(tenantId, { configId: 'config-123' });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND a.agent_config_id ='),
        expect.arrayContaining([tenantId, 'config-123'])
      );
    });

    it('should filter by provider ID', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await agentConfigService.getAnalytics(tenantId, { providerId: 'provider-123' });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND a.provider_id ='),
        expect.arrayContaining([tenantId, 'provider-123'])
      );
    });

    it('should filter by date range', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await agentConfigService.getAnalytics(tenantId, { startDate, endDate });

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('AND a.period_start >='),
        expect.arrayContaining([tenantId, startDate, endDate])
      );
    });
  });

  describe('validateConfiguration', () => {
    it('should validate a valid configuration', () => {
      const input: CreateAgentConfigInput = {
        name: 'Valid Config',
        systemPrompt: 'System prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint', 'hpi'],
        temperature: 0.5,
        maxTokens: 2000,
        outputFormat: 'soap',
        verbosityLevel: 'standard',
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty name', () => {
      const input: CreateAgentConfigInput = {
        name: '',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Name is required');
    });

    it('should reject empty system prompt', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: '',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('System prompt is required');
    });

    it('should reject empty prompt template', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: '',
        noteSections: ['chiefComplaint'],
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prompt template is required');
    });

    it('should reject empty note sections', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: [],
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one note section is required');
    });

    it('should reject invalid temperature', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
        temperature: 1.5,
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Temperature must be between 0 and 1');
    });

    it('should reject invalid max tokens', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
        maxTokens: 50,
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max tokens must be between 100 and 16000');
    });

    it('should reject invalid output format', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
        outputFormat: 'invalid',
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Output format must be one of: soap, narrative, procedure_note');
    });

    it('should reject invalid verbosity level', () => {
      const input: CreateAgentConfigInput = {
        name: 'Config',
        systemPrompt: 'Prompt',
        promptTemplate: 'Template',
        noteSections: ['chiefComplaint'],
        verbosityLevel: 'invalid',
      };

      const result = agentConfigService.validateConfiguration(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Verbosity level must be one of: concise, standard, detailed');
    });
  });
});
