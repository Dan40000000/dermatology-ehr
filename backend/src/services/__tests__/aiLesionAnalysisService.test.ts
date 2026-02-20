import { pool } from '../../db/pool';
import { aiLesionAnalysisService } from '../aiLesionAnalysisService';
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

const queryMock = pool.query as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

global.fetch = jest.fn();

describe('aiLesionAnalysisService', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockReset();
    loggerMock.error.mockReset();
  });

  describe('analyzeImage', () => {
    it('logs Error instances and throws a generic failure', async () => {
      queryMock.mockRejectedValueOnce(new Error('db down'));

      await expect(
        aiLesionAnalysisService.analyzeImage('image-1', tenantId, userId)
      ).rejects.toThrow('Failed to analyze lesion image');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Lesion Analysis Error', {
        error: 'db down',
      });
    });

    it('masks non-Error values in logs', async () => {
      queryMock.mockRejectedValueOnce({ patientName: 'Jane Doe' });

      await expect(
        aiLesionAnalysisService.analyzeImage('image-1', tenantId, userId)
      ).rejects.toThrow('Failed to analyze lesion image');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Lesion Analysis Error', {
        error: 'Unknown error',
      });
    });
  });

  describe('compareToPrior', () => {
    it('logs Error instances and throws a generic failure', async () => {
      queryMock.mockRejectedValueOnce(new Error('db compare failure'));

      await expect(
        aiLesionAnalysisService.compareToPrior('image-current', 'image-prior', tenantId, userId)
      ).rejects.toThrow('Failed to compare images');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Comparison Error', {
        error: 'db compare failure',
      });
    });

    it('masks non-Error values in logs', async () => {
      queryMock.mockRejectedValueOnce({ photoUrl: 'https://secret.example/image.jpg' });

      await expect(
        aiLesionAnalysisService.compareToPrior('image-current', 'image-prior', tenantId, userId)
      ).rejects.toThrow('Failed to compare images');
      expect(loggerMock.error).toHaveBeenCalledWith('AI Comparison Error', {
        error: 'Unknown error',
      });
    });
  });

  describe('recordFeedback', () => {
    it('logs Error instances and throws a generic failure', async () => {
      queryMock.mockRejectedValueOnce(new Error('feedback query failed'));

      await expect(
        aiLesionAnalysisService.recordFeedback('analysis-1', userId, tenantId, { wasAccurate: true })
      ).rejects.toThrow('Failed to record feedback');
      expect(loggerMock.error).toHaveBeenCalledWith('Record Feedback Error', {
        error: 'feedback query failed',
      });
    });

    it('masks non-Error values in logs', async () => {
      queryMock.mockRejectedValueOnce({ subscriberName: 'Jane Doe' });

      await expect(
        aiLesionAnalysisService.recordFeedback('analysis-1', userId, tenantId, { wasAccurate: false })
      ).rejects.toThrow('Failed to record feedback');
      expect(loggerMock.error).toHaveBeenCalledWith('Record Feedback Error', {
        error: 'Unknown error',
      });
    });
  });

  describe('provider fallback logging', () => {
    it('masks non-Error Claude failures and falls back to mock analysis', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce({ timeout: true });

      const result = await (aiLesionAnalysisService as any).analyzeWithClaude(
        'https://example.com/lesion.jpg',
        'standard'
      );

      expect(result).toEqual(
        expect.objectContaining({
          primaryClassification: expect.any(String),
          riskLevel: expect.any(String),
        })
      );
      expect(loggerMock.error).toHaveBeenCalledWith('Claude Vision API Error', {
        error: 'Unknown error',
      });
    });

    it('masks non-Error OpenAI failures and falls back to mock analysis', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce({ timeout: true });

      const result = await (aiLesionAnalysisService as any).analyzeWithOpenAI(
        'https://example.com/lesion.jpg',
        'standard'
      );

      expect(result).toEqual(
        expect.objectContaining({
          primaryClassification: expect.any(String),
          riskLevel: expect.any(String),
        })
      );
      expect(loggerMock.error).toHaveBeenCalledWith('OpenAI Vision API Error', {
        error: 'Unknown error',
      });
    });
  });
});
