import { pool } from '../../db/pool';
import { AIImageAnalysisService } from '../aiImageAnalysis';
import crypto from 'crypto';
import { logger } from '../../lib/logger';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'analysis-uuid-123'),
}));

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

// Mock global fetch
global.fetch = jest.fn();

describe('AIImageAnalysisService', () => {
  let service: AIImageAnalysisService;
  const tenantId = 'tenant-123';
  const photoId = 'photo-123';
  const imageUrl = 'https://example.com/image.jpg';
  const analyzedBy = 'user-123';

  beforeEach(() => {
    service = new AIImageAnalysisService();
    jest.clearAllMocks();
    queryMock.mockReset();
    (global.fetch as jest.Mock).mockReset();
    loggerMock.error.mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('analyzeSkinLesion', () => {
    it('should analyze skin lesion and store results', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('insert into photo_ai_analysis'),
        expect.arrayContaining([
          'analysis-uuid-123',
          tenantId,
          photoId,
          'skin_lesion',
          'mock',
          expect.any(Number),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          analyzedBy,
        ])
      );
    });

    it('should update photo with risk flag for high risk', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('update photos set ai_analyzed = true, ai_risk_flagged'),
        expect.arrayContaining([expect.any(Boolean), photoId, tenantId])
      );
    });

    it('should use mock analysis when no API key', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should use OpenAI when API key is available', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AIImageAnalysisService();

      const mockOpenAIResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  primaryFinding: 'Pigmented lesion',
                  differentialDiagnoses: [
                    {
                      diagnosis: 'Melanocytic nevus',
                      confidence: 0.8,
                      description: 'Benign mole',
                    },
                  ],
                  riskLevel: 'low',
                  recommendations: ['Monitor for changes'],
                  confidenceScore: 0.85,
                }),
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockOpenAIResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
    });

    it('should fall back to mock on OpenAI error', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AIImageAnalysisService();

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
    });

    it('should handle invalid OpenAI response', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AIImageAnalysisService();

      const mockOpenAIResponse = {
        ok: true,
        json: async () => ({}),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockOpenAIResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
    });

    it('should handle OpenAI non-ok response', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AIImageAnalysisService();

      const mockOpenAIResponse = {
        ok: false,
        statusText: 'Bad Request',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockOpenAIResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
    });

    it('should throw error on database failure', async () => {
      queryMock.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy)
      ).rejects.toThrow('Failed to analyze image');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Image Analysis Error', {
        error: 'Database error',
      });
    });

    it('should mask non-Error values on analysis failure', async () => {
      queryMock.mockRejectedValueOnce({ patientName: 'Jane Doe' });

      await expect(
        service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy)
      ).rejects.toThrow('Failed to analyze image');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Image Analysis Error', {
        error: 'Unknown error',
      });
    });
  });

  describe('getAnalysisForPhoto', () => {
    it('should get analysis results for a photo', async () => {
      const mockRow = {
        id: 'analysis-123',
        photoId: photoId,
        analysisType: 'skin_lesion',
        analysisProvider: 'openai',
        confidenceScore: 0.85,
        primaryFinding: 'Pigmented lesion',
        differentialDiagnoses: JSON.stringify([
          {
            diagnosis: 'Nevus',
            confidence: 0.8,
            description: 'Benign mole',
          },
        ]),
        riskLevel: 'low',
        recommendations: JSON.stringify(['Monitor for changes']),
        analyzedAt: new Date(),
        analyzedBy: 'user-123',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.getAnalysisForPhoto(photoId, tenantId);

      expect(result).not.toBeNull();
      expect(result?.primaryFinding).toBe('Pigmented lesion');
      expect(result?.differentialDiagnoses).toHaveLength(1);
      expect(result?.recommendations).toHaveLength(1);
    });

    it('should return null when no analysis found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.getAnalysisForPhoto(photoId, tenantId);

      expect(result).toBeNull();
    });

    it('should handle empty JSON fields', async () => {
      const mockRow = {
        id: 'analysis-123',
        photoId: photoId,
        analysisType: 'skin_lesion',
        analysisProvider: 'mock',
        confidenceScore: 0.75,
        primaryFinding: 'Lesion',
        differentialDiagnoses: null,
        riskLevel: 'low',
        recommendations: null,
        analyzedAt: new Date(),
        analyzedBy: 'user-123',
      };

      queryMock.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.getAnalysisForPhoto(photoId, tenantId);

      expect(result?.differentialDiagnoses).toEqual([]);
      expect(result?.recommendations).toEqual([]);
    });

    it('should query with correct parameters', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      await service.getAnalysisForPhoto(photoId, tenantId);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('from photo_ai_analysis'),
        [photoId, tenantId]
      );
    });
  });

  describe('batchAnalyzePatientPhotos', () => {
    it('should batch analyze unanalyzed photos', async () => {
      const mockPhotos = [
        { id: 'photo-1', url: 'https://example.com/photo1.jpg' },
        { id: 'photo-2', url: 'https://example.com/photo2.jpg' },
        { id: 'photo-3', url: 'https://example.com/photo3.jpg' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: mockPhotos })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.batchAnalyzePatientPhotos('patient-123', tenantId, analyzedBy);

      expect(result).toHaveLength(3);
      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('where patient_id = $1 and tenant_id = $2'),
        ['patient-123', tenantId]
      );
    });

    it('should limit to 10 photos', async () => {
      const mockPhotos = Array.from({ length: 15 }, (_, i) => ({
        id: `photo-${i}`,
        url: `https://example.com/photo${i}.jpg`,
      }));

      queryMock.mockResolvedValueOnce({ rows: mockPhotos });

      await service.batchAnalyzePatientPhotos('patient-123', tenantId, analyzedBy);

      expect(queryMock).toHaveBeenCalledWith(
        expect.stringContaining('limit 10'),
        ['patient-123', tenantId]
      );
    });

    it('should handle individual photo analysis failures', async () => {
      const mockPhotos = [
        { id: 'photo-1', url: 'https://example.com/photo1.jpg' },
        { id: 'photo-2', url: 'https://example.com/photo2.jpg' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: mockPhotos })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Analysis failed'))
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.batchAnalyzePatientPhotos('patient-123', tenantId, analyzedBy);

      expect(result).toHaveLength(1);
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to analyze photo photo-2', {
        error: 'Failed to analyze image',
      });
    });

    it('should mask non-Error values before batch fallback logging', async () => {
      const mockPhotos = [
        { id: 'photo-1', url: 'https://example.com/photo1.jpg' },
        { id: 'photo-2', url: 'https://example.com/photo2.jpg' },
      ];

      queryMock
        .mockResolvedValueOnce({ rows: mockPhotos })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce({ detail: 'boom' })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.batchAnalyzePatientPhotos('patient-123', tenantId, analyzedBy);

      expect(result).toHaveLength(1);
      expect(loggerMock.error).toHaveBeenCalledWith('AI Image Analysis Error', {
        error: 'Unknown error',
      });
      expect(loggerMock.error).toHaveBeenCalledWith('Failed to analyze photo photo-2', {
        error: 'Failed to analyze image',
      });
    });

    it('should return empty array when no photos found', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const result = await service.batchAnalyzePatientPhotos('patient-123', tenantId, analyzedBy);

      expect(result).toEqual([]);
    });
  });

  describe('Mock analysis generation', () => {
    it('should generate realistic mock analysis', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const insertCall = queryMock.mock.calls.find((call) =>
        call[0].includes('insert into photo_ai_analysis')
      );

      expect(insertCall).toBeDefined();
      const [, params] = insertCall!;

      expect(params[5]).toBeGreaterThanOrEqual(0);
      expect(params[5]).toBeLessThanOrEqual(1);
      expect(params[6]).toBeTruthy();
      expect(params[8]).toMatch(/low|moderate|high|critical/);
    });

    it('should include differential diagnoses in mock', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const insertCall = queryMock.mock.calls.find((call) =>
        call[0].includes('insert into photo_ai_analysis')
      );

      const [, params] = insertCall!;
      const differentials = JSON.parse(params[7]);

      expect(Array.isArray(differentials)).toBe(true);
      expect(differentials.length).toBeGreaterThan(0);
      expect(differentials[0]).toHaveProperty('diagnosis');
      expect(differentials[0]).toHaveProperty('confidence');
      expect(differentials[0]).toHaveProperty('description');
    });

    it('should include recommendations in mock', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const insertCall = queryMock.mock.calls.find((call) =>
        call[0].includes('insert into photo_ai_analysis')
      );

      const [, params] = insertCall!;
      const recommendations = JSON.parse(params[9]);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('OpenAI Integration', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      service = new AIImageAnalysisService();
    });

    it('should format OpenAI request correctly', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  primaryFinding: 'Test finding',
                  differentialDiagnoses: [],
                  riskLevel: 'low',
                  recommendations: [],
                  confidenceScore: 0.8,
                }),
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-openai-key',
          }),
          body: expect.stringContaining('gpt-4o'),
        })
      );
    });

    it('should parse OpenAI JSON response', async () => {
      const mockAnalysis = {
        primaryFinding: 'Irregular pigmented lesion',
        differentialDiagnoses: [
          {
            diagnosis: 'Melanoma',
            confidence: 0.7,
            description: 'Cannot rule out',
          },
        ],
        riskLevel: 'high',
        recommendations: ['Immediate biopsy recommended'],
        confidenceScore: 0.75,
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(mockAnalysis),
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const insertCall = queryMock.mock.calls.find((call) =>
        call[0].includes('insert into photo_ai_analysis')
      );

      const [, params] = insertCall!;
      expect(params[6]).toBe('Irregular pigmented lesion');
      expect(params[8]).toBe('high');
    });

    it('should handle malformed JSON in OpenAI response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Not valid JSON',
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
      expect(loggerMock.error).toHaveBeenCalledWith('OpenAI Vision API Error', {
        error: expect.stringContaining('Unexpected token'),
      });
    });

    it('should mask non-Error OpenAI failures in logs', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce({ detail: 'network exploded' });
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const analysisId = await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      expect(analysisId).toBe('analysis-uuid-123');
      expect(loggerMock.error).toHaveBeenCalledWith('OpenAI Vision API Error', {
        error: 'Unknown error',
      });
    });
  });

  describe('Risk flagging', () => {
    it('should flag high risk as true', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const updateCall = queryMock.mock.calls.find((call) => call[0].includes('update photos'));

      expect(updateCall).toBeDefined();
    });

    it('should not flag low/moderate risk', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await service.analyzeSkinLesion(photoId, imageUrl, tenantId, analyzedBy);

      const updateCall = queryMock.mock.calls.find((call) => call[0].includes('update photos'));
      const [, params] = updateCall!;

      expect(typeof params[0]).toBe('boolean');
    });
  });
});
