import request from 'supertest';
import express from 'express';
import aiNoteDraftingRouter from '../aiNoteDrafting';
import { aiNoteDraftingService } from '../../services/aiNoteDrafting';
import { pool } from '../../db/pool';
import { logger } from '../../lib/logger';

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenantId: 'tenant-1', role: 'provider' };
    return next();
  },
}));

jest.mock('../../middleware/rbac', () => ({
  requireRoles: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/aiNoteDrafting', () => ({
  aiNoteDraftingService: {
    generateNoteDraft: jest.fn(),
    getSmartSuggestions: jest.fn(),
    recordSuggestionFeedback: jest.fn(),
  },
}));

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

const app = express();
app.use(express.json());
app.use('/ai-notes', aiNoteDraftingRouter);

const queryMock = pool.query as jest.Mock;
const generateDraftMock = aiNoteDraftingService.generateNoteDraft as jest.Mock;
const getSuggestionsMock = aiNoteDraftingService.getSmartSuggestions as jest.Mock;
const recordFeedbackMock = aiNoteDraftingService.recordSuggestionFeedback as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

beforeEach(() => {
  queryMock.mockReset();
  generateDraftMock.mockReset();
  getSuggestionsMock.mockReset();
  recordFeedbackMock.mockReset();
  loggerMock.error.mockReset();

  queryMock.mockResolvedValue({ rows: [] });
});

describe('AI note drafting routes', () => {
  it('POST /ai-notes/draft rejects invalid payload', async () => {
    const res = await request(app).post('/ai-notes/draft').send({ briefNotes: 'Missing patientId' });

    expect(res.status).toBe(400);
  });

  it('POST /ai-notes/draft returns draft and records suggestions', async () => {
    generateDraftMock.mockResolvedValueOnce({
      chiefComplaint: 'AI CC',
      hpi: 'AI HPI',
      ros: 'AI ROS',
      exam: 'AI Exam',
      assessmentPlan: 'AI Plan',
      confidenceScore: 0.85,
      suggestions: [
        { section: 'hpi', suggestion: 'Add onset timeline', confidence: 0.8 },
        { section: 'exam', suggestion: 'Document size', confidence: 0.9 },
      ],
    });

    const res = await request(app).post('/ai-notes/draft').send({
      patientId: 'patient-1',
      encounterId: 'enc-1',
      briefNotes: 'Notes for AI',
    });

    expect(res.status).toBe(200);
    expect(res.body.draft.chiefComplaint).toBe('AI CC');
    expect(generateDraftMock).toHaveBeenCalledWith(
      {
        patientId: 'patient-1',
        encounterId: 'enc-1',
        briefNotes: 'Notes for AI',
        providerId: 'user-1',
      },
      'tenant-1'
    );
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('POST /ai-notes/draft skips suggestion storage without encounterId', async () => {
    generateDraftMock.mockResolvedValueOnce({
      chiefComplaint: 'AI CC',
      hpi: 'AI HPI',
      ros: 'AI ROS',
      exam: 'AI Exam',
      assessmentPlan: 'AI Plan',
      confidenceScore: 0.85,
      suggestions: [],
    });

    const res = await request(app).post('/ai-notes/draft').send({
      patientId: 'patient-1',
      briefNotes: 'Notes for AI',
    });

    expect(res.status).toBe(200);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('POST /ai-notes/draft returns 500 on service error', async () => {
    generateDraftMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/ai-notes/draft').send({
      patientId: 'patient-1',
      briefNotes: 'Notes for AI',
    });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith('Draft generation error:', {
      error: 'boom',
    });
  });

  it('POST /ai-notes/draft masks non-Error failures', async () => {
    generateDraftMock.mockRejectedValueOnce({ patientName: 'Jane Doe' });

    const res = await request(app).post('/ai-notes/draft').send({
      patientId: 'patient-1',
      briefNotes: 'Notes for AI',
    });

    expect(res.status).toBe(500);
    expect(loggerMock.error).toHaveBeenCalledWith('Draft generation error:', {
      error: 'Unknown error',
    });
  });

  it('POST /ai-notes/suggestions returns smart suggestions', async () => {
    getSuggestionsMock.mockResolvedValueOnce(['Suggestion A', 'Suggestion B']);

    const res = await request(app).post('/ai-notes/suggestions').send({
      encounterId: 'enc-1',
      section: 'hpi',
      currentText: 'Patient presents with',
    });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual(['Suggestion A', 'Suggestion B']);
    expect(getSuggestionsMock).toHaveBeenCalledWith('enc-1', 'hpi', 'Patient presents with', 'tenant-1');
  });

  it('POST /ai-notes/suggestions rejects invalid payload', async () => {
    const res = await request(app).post('/ai-notes/suggestions').send({ encounterId: 'enc-1' });

    expect(res.status).toBe(400);
  });

  it('POST /ai-notes/suggestions returns 500 on service error', async () => {
    getSuggestionsMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).post('/ai-notes/suggestions').send({
      encounterId: 'enc-1',
      section: 'hpi',
      currentText: 'Patient presents with',
    });

    expect(res.status).toBe(500);
  });

  it('POST /ai-notes/suggestions/:id/feedback validates payload', async () => {
    const res = await request(app).post('/ai-notes/suggestions/sugg-1/feedback').send({});

    expect(res.status).toBe(400);
  });

  it('POST /ai-notes/suggestions/:id/feedback records feedback', async () => {
    const res = await request(app)
      .post('/ai-notes/suggestions/sugg-1/feedback')
      .send({ accepted: true, feedback: 'Great' });

    expect(res.status).toBe(200);
    expect(recordFeedbackMock).toHaveBeenCalledWith('sugg-1', true, 'Great', 'tenant-1');
  });

  it('POST /ai-notes/suggestions/:id/feedback returns 500 on error', async () => {
    recordFeedbackMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app)
      .post('/ai-notes/suggestions/sugg-1/feedback')
      .send({ accepted: false });

    expect(res.status).toBe(500);
  });

  it('GET /ai-notes/suggestions/:encounterId returns suggestions', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'sugg-1' }] });

    const res = await request(app).get('/ai-notes/suggestions/enc-1');

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(1);
  });

  it('GET /ai-notes/suggestions/:encounterId returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/ai-notes/suggestions/enc-1');

    expect(res.status).toBe(500);
  });

  it('GET /ai-notes/stats returns zero acceptance rate', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          totalSuggestions: 0,
          acceptedSuggestions: 0,
          rejectedSuggestions: 0,
          avgConfidence: null,
          encountersWithSuggestions: 0,
        },
      ],
    });

    const res = await request(app).get('/ai-notes/stats');

    expect(res.status).toBe(200);
    expect(res.body.acceptanceRate).toBe('0.0');
  });

  it('GET /ai-notes/stats returns acceptance rate', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          totalSuggestions: 5,
          acceptedSuggestions: 4,
          rejectedSuggestions: 1,
          avgConfidence: 0.77,
          encountersWithSuggestions: 2,
        },
      ],
    });

    const res = await request(app).get('/ai-notes/stats');

    expect(res.status).toBe(200);
    expect(res.body.acceptanceRate).toBe('80.0');
  });

  it('GET /ai-notes/stats returns 500 on error', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app).get('/ai-notes/stats');

    expect(res.status).toBe(500);
  });
});
