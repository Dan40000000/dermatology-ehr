import { pool } from '../../db/pool';
import { AINoteDraftingService } from '../aiNoteDrafting';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

const queryMock = pool.query as jest.Mock;

describe('AINoteDraftingService', () => {
  let service: AINoteDraftingService;
  const tenantId = 'tenant-123';
  const patientId = 'patient-123';
  const providerId = 'provider-123';

  beforeEach(() => {
    service = new AINoteDraftingService();
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('generateNoteDraft', () => {
    const request = {
      patientId,
      providerId,
      chiefComplaint: 'Rash on arms',
      briefNotes: 'Patient presents with pruritic rash',
    };

    it('should generate a note draft with mock when no API key', async () => {
      const mockPatient = {
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-01',
        sex: 'M',
        medical_history: 'Hypertension',
        allergies: 'Penicillin',
        current_medications: 'Lisinopril 10mg',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.generateNoteDraft(request, tenantId);

      expect(result).toHaveProperty('chiefComplaint');
      expect(result).toHaveProperty('hpi');
      expect(result).toHaveProperty('ros');
      expect(result).toHaveProperty('exam');
      expect(result).toHaveProperty('assessmentPlan');
      expect(result).toHaveProperty('confidenceScore');
      expect(result).toHaveProperty('suggestions');
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should use OpenAI when API key is available', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AINoteDraftingService();

      const mockPatient = {
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1990-01-01',
        sex: 'M',
      };

      const mockOpenAIResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  chiefComplaint: 'Rash on both arms',
                  hpi: 'Patient presents with...',
                  ros: 'Negative except as noted',
                  exam: 'Erythematous patches',
                  assessmentPlan: 'Contact dermatitis',
                }),
              },
            },
          ],
        }),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockOpenAIResponse);

      const result = await service.generateNoteDraft(request, tenantId);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
      expect(result.chiefComplaint).toBe('Rash on both arms');
    });

    it('should use Anthropic when API key is available', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      service = new AINoteDraftingService();

      const mockPatient = {
        first_name: 'Jane',
        last_name: 'Smith',
        date_of_birth: '1985-05-15',
        sex: 'F',
      };

      const mockClaudeResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Skin concern',
                hpi: 'Details...',
                ros: 'Negative',
                exam: 'Exam findings',
                assessmentPlan: 'Plan',
              }),
            },
          ],
        }),
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockClaudeResponse);

      const result = await service.generateNoteDraft(request, tenantId);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
          }),
        })
      );
      expect(result.chiefComplaint).toBe('Skin concern');
    });

    it('should include template when provided', async () => {
      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };
      const mockTemplate = { chiefComplaint: 'Template CC', hpi: 'Template HPI' };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ template_content: mockTemplate }] })
        .mockResolvedValueOnce({ rows: [] });

      const requestWithTemplate = {
        ...request,
        templateId: 'template-123',
      };

      const result = await service.generateNoteDraft(requestWithTemplate, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('from note_templates'),
        ['template-123', tenantId]
      );
      expect(result).toBeDefined();
    });

    it('should include prior encounter notes', async () => {
      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };
      const mockPriorNotes = [
        {
          soap_note: 'Previous note',
          encounter_date: '2024-01-01',
          chief_complaint: 'Previous visit',
        },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: mockPriorNotes });

      const result = await service.generateNoteDraft(request, tenantId);

      expect(result).toBeDefined();
    });

    it('should include provider writing style', async () => {
      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };
      const mockProviderNotes = [
        { soap_note: 'Provider note 1' },
        { soap_note: 'Provider note 2' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: mockProviderNotes })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.generateNoteDraft(request, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('from encounters'),
        [providerId, tenantId]
      );
      expect(result).toBeDefined();
    });

    it('should handle OpenAI errors gracefully', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      service = new AINoteDraftingService();

      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
      });

      await expect(service.generateNoteDraft(request, tenantId)).rejects.toThrow(
        'OpenAI API error: Bad Request'
      );
    });

    it('should handle invalid OpenAI response', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      service = new AINoteDraftingService();

      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(service.generateNoteDraft(request, tenantId)).rejects.toThrow(
        'Invalid response from OpenAI API'
      );
    });

    it('should parse plain text response when JSON fails', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      service = new AINoteDraftingService();

      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };

      const plainTextResponse = `Chief Complaint: Rash on arms
HPI: Patient presents with rash
ROS: Negative
Exam: Erythematous patches
Assessment and Plan: Contact dermatitis, prescribe topical steroid`;

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: plainTextResponse } }],
        }),
      });

      const result = await service.generateNoteDraft(request, tenantId);

      expect(result.chiefComplaint).toContain('Rash on arms');
    });
  });

  describe('recordSuggestionFeedback', () => {
    it('should record feedback for a suggestion', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.recordSuggestionFeedback('suggestion-123', true, 'Good suggestion', tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('update ai_note_suggestions'),
        [true, 'Good suggestion', 'suggestion-123', tenantId]
      );
    });

    it('should handle rejection feedback', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.recordSuggestionFeedback(
        'suggestion-456',
        false,
        'Not relevant',
        tenantId
      );

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        [false, 'Not relevant', 'suggestion-456', tenantId]
      );
    });

    it('should handle null feedback', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.recordSuggestionFeedback('suggestion-789', true, null, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.any(String),
        [true, null, 'suggestion-789', tenantId]
      );
    });
  });

  describe('getSmartSuggestions', () => {
    it('should get suggestions for a section', async () => {
      const mockEncounter = {
        provider_id: providerId,
      };

      const mockPastNotes = [
        { soap_note: 'Past note 1' },
        { soap_note: 'Past note 2' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValueOnce({ rows: mockPastNotes });

      const result = await service.getSmartSuggestions(
        'encounter-123',
        'hpi',
        'Patient presents with',
        tenantId
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty array when encounter not found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.getSmartSuggestions(
        'nonexistent',
        'hpi',
        'text',
        tenantId
      );

      expect(result).toEqual([]);
    });

    it('should return HPI-specific phrases for HPI section', async () => {
      const mockEncounter = { provider_id: providerId };

      queryMock
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSmartSuggestions('encounter-123', 'hpi', '', tenantId);

      expect(result).toContain('gradual onset over');
      expect(result).toContain('associated with itching');
    });

    it('should return exam-specific phrases for exam section', async () => {
      const mockEncounter = { provider_id: providerId };

      queryMock
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSmartSuggestions('encounter-123', 'exam', '', tenantId);

      expect(result).toContain('well-demarcated');
      expect(result).toContain('erythematous plaque');
    });

    it('should return assessment plan phrases for assessmentPlan section', async () => {
      const mockEncounter = { provider_id: providerId };

      queryMock
        .mockResolvedValueOnce({ rows: [mockEncounter] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSmartSuggestions(
        'encounter-123',
        'assessmentPlan',
        '',
        tenantId
      );

      expect(result).toContain('Continue current regimen');
      expect(result).toContain('Follow up in 4-6 weeks');
    });
  });

  describe('Mock draft generation', () => {
    it('should generate mock with suggestions', async () => {
      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const request = {
        patientId,
        providerId,
        chiefComplaint: 'Test complaint',
      };

      const result = await service.generateNoteDraft(request, tenantId);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toHaveProperty('section');
      expect(result.suggestions[0]).toHaveProperty('suggestion');
      expect(result.suggestions[0]).toHaveProperty('confidence');
    });

    it('should use chief complaint in mock', async () => {
      const mockPatient = { first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01', sex: 'M' };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const request = {
        patientId,
        providerId,
        chiefComplaint: 'Specific complaint text',
      };

      const result = await service.generateNoteDraft(request, tenantId);

      expect(result.chiefComplaint).toContain('Specific complaint text');
    });
  });

  describe('Age calculation', () => {
    it('should calculate age correctly', async () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 35);

      const mockPatient = {
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: birthDate.toISOString().split('T')[0],
        sex: 'M',
      };

      queryMock
        .mockResolvedValueOnce({ rows: [mockPatient] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.generateNoteDraft({ patientId, providerId }, tenantId);

      expect(result).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error on database failure', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.generateNoteDraft({ patientId, providerId }, tenantId)
      ).rejects.toThrow('Failed to generate note draft');
    });

    it('should handle console errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      queryMock.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.generateNoteDraft({ patientId, providerId }, tenantId)
      ).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Note draft generation error:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
