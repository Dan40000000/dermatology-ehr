import { logger } from '../../lib/logger';
import * as ambientAI from '../ambientAI';
import fs from 'fs/promises';

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('fs/promises');
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getBuffer: jest.fn(() => Buffer.from('mock-form-data')),
    getHeaders: jest.fn(() => ({})),
  }));
});

// Mock global fetch
global.fetch = jest.fn();

describe('AmbientAI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    (fs.readFile as jest.Mock).mockReset();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_TRANSCRIBE_MODEL;
    delete process.env.OPENAI_NOTE_MODEL;
    delete process.env.ANTHROPIC_NOTE_MODEL;
    process.env.AMBIENT_AI_MOCK_DELAY_MS = '0';
  });

  afterAll(() => {
    delete process.env.AMBIENT_AI_MOCK_DELAY_MS;
  });

  describe('transcribeAudio', () => {
    const audioFilePath = '/tmp/test-audio.webm';
    const durationSeconds = 120;

    it('should use mock transcription when no API key configured', async () => {
      const result = await ambientAI.transcribeAudio(audioFilePath, durationSeconds);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('segments');
      expect(result).toHaveProperty('speakers');
      expect(result).toHaveProperty('speakerCount');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('wordCount');
      expect(result).toHaveProperty('phiEntities');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('duration');
      expect(result.duration).toBe(durationSeconds);
      expect(logger.info).toHaveBeenCalledWith(
        'Using mock transcription (no API key configured)'
      );
    });

    it('should use OpenAI transcription when API key available', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-transcribe-diarize';

      const mockAudioBuffer = Buffer.from('fake audio data');
      (fs.readFile as jest.Mock).mockResolvedValueOnce(mockAudioBuffer);

      const mockTranscribeResponse = {
        ok: true,
        json: async () => ({
          text: 'Transcribed text from OpenAI',
          segments: [
            {
              text: 'Transcribed text from OpenAI',
              start: 0,
              end: 10,
              speaker: 'A'
            },
          ],
          language: 'en',
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockTranscribeResponse);

      const result = await ambientAI.transcribeAudio(audioFilePath, durationSeconds);

      expect(fs.readFile).toHaveBeenCalledWith(audioFilePath);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
      expect(result.text).toBe('Transcribed text from OpenAI');
      expect(logger.info).toHaveBeenCalledWith(
        'Transcribing audio with OpenAI',
        expect.objectContaining({ durationSeconds, model: 'gpt-4o-transcribe-diarize' })
      );
    });

    it('should fallback to mock when OpenAI transcription fails', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-transcribe-diarize';

      (fs.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('fake audio'));
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const result = await ambientAI.transcribeAudio(audioFilePath, durationSeconds);

      expect(logger.warn).toHaveBeenCalledWith(
        'OpenAI transcription failed, falling back to mock',
        expect.objectContaining({ error: 'API Error', model: 'gpt-4o-transcribe-diarize' })
      );
      expect(result.segments.length).toBeGreaterThan(0);
    });

    it('should handle OpenAI non-ok response', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-transcribe-diarize';

      (fs.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('fake audio'));

      const mockResponse = {
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.transcribeAudio(audioFilePath, durationSeconds);

      expect(result.segments.length).toBeGreaterThan(0);
    });

    it('should generate realistic mock conversation', async () => {
      const result = await ambientAI.transcribeAudio(audioFilePath, 240);

      expect(result.segments.length).toBeGreaterThan(5);
      expect(result.speakerCount).toBe(2);
      expect(result.speakers['speaker_0'].label).toBe('doctor');
      expect(result.speakers['speaker_1'].label).toBe('patient');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('should detect PHI in transcription', async () => {
      const result = await ambientAI.transcribeAudio(audioFilePath, durationSeconds);

      expect(Array.isArray(result.phiEntities)).toBe(true);
    });

    it('should assign timestamps to segments', async () => {
      const result = await ambientAI.transcribeAudio(audioFilePath, 100);

      result.segments.forEach((segment) => {
        expect(segment).toHaveProperty('start');
        expect(segment).toHaveProperty('end');
        expect(segment.end).toBeGreaterThan(segment.start);
      });

      const lastSegment = result.segments[result.segments.length - 1];
      expect(lastSegment.end).toBeLessThanOrEqual(100 + 50);
    });
  });

  describe('generateClinicalNote', () => {
    const transcriptText = 'Patient presents with rash on arms for 2 weeks.';
    const segments: ambientAI.TranscriptionSegment[] = [
      {
        speaker: 'speaker_0',
        text: 'What brings you in today?',
        start: 0,
        end: 2,
        confidence: 0.95,
      },
      {
        speaker: 'speaker_1',
        text: 'I have a rash on my arms.',
        start: 2,
        end: 5,
        confidence: 0.93,
      },
    ];
    const doctorPatientSegments: ambientAI.TranscriptionSegment[] = [
      {
        speaker: 'doctor',
        text: 'What brings you in today?',
        start: 0,
        end: 3,
        confidence: 0.95,
      },
      {
        speaker: 'patient',
        text: 'I have an itchy rash on both forearms for two weeks.',
        start: 3,
        end: 8,
        confidence: 0.94,
      },
      {
        speaker: 'doctor',
        text: 'Exam shows erythematous papules; start triamcinolone cream twice daily.',
        start: 8,
        end: 14,
        confidence: 0.93,
      },
    ];

    it('should use mock note generation when no API key', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result).toHaveProperty('chiefComplaint');
      expect(result).toHaveProperty('hpi');
      expect(result).toHaveProperty('ros');
      expect(result).toHaveProperty('physicalExam');
      expect(result).toHaveProperty('assessment');
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('overallConfidence');
      expect(result).toHaveProperty('sectionConfidence');
      expect(result).toHaveProperty('suggestedIcd10');
      expect(result).toHaveProperty('suggestedCpt');
      expect(result).toHaveProperty('medications');
      expect(result).toHaveProperty('allergies');
      expect(result).toHaveProperty('followUpTasks');
      expect(result).toHaveProperty('differentialDiagnoses');
      expect(result).toHaveProperty('recommendedTests');
      expect(result).toHaveProperty('patientSummary');
      expect(logger.info).toHaveBeenCalledWith(
        'Using mock note generation (no API key configured)'
      );
    });

    it('should support doctor/patient speaker labels in mock generation', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, doctorPatientSegments);

      expect(result.chiefComplaint.toLowerCase()).toContain('rash');
      expect(result.patientSummary.yourConcerns.length).toBeGreaterThan(0);
      expect(result.medications.some((med) => med.name.toLowerCase().includes('triamcinolone'))).toBe(true);
    });

    it('should use Claude when Anthropic API key available', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockClaudeResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Rash on arms',
                hpi: 'Patient reports...',
                ros: 'Negative except as noted',
                physicalExam: 'Erythematous patches',
                assessment: 'Contact dermatitis',
                plan: 'Topical steroid',
                sectionConfidence: {
                  chiefComplaint: 0.95,
                  hpi: 0.9,
                  ros: 0.85,
                  physicalExam: 0.92,
                  assessment: 0.88,
                  plan: 0.91,
                },
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [],
                differentialDiagnoses: [],
                recommendedTests: [],
                patientSummary: {
                  whatWeDiscussed: 'Rash',
                  yourConcerns: ['Itchy rash'],
                  treatmentPlan: 'Use cream',
                  followUp: '2 weeks',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockClaudeResponse);

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
          }),
        })
      );
      expect(result.chiefComplaint).toBe('Rash on arms');
      expect(logger.info).toHaveBeenCalledWith(
        'Generating clinical note with Claude',
        expect.any(Object)
      );
    });

    it('should use OpenAI when only OpenAI key available', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_NOTE_MODEL = 'gpt-4o';

      const mockGPT4Response = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  chiefComplaint: 'Rash',
                  hpi: 'Details...',
                  ros: 'Negative',
                  physicalExam: 'Erythema',
                  assessment: 'Dermatitis',
                  plan: 'Treatment',
                  sectionConfidence: {
                    chiefComplaint: 0.9,
                    hpi: 0.85,
                    ros: 0.8,
                    physicalExam: 0.87,
                    assessment: 0.83,
                    plan: 0.86,
                  },
                  suggestedIcd10: [],
                  suggestedCpt: [],
                  medications: [],
                  allergies: [],
                  followUpTasks: [],
                  differentialDiagnoses: [],
                  recommendedTests: [],
                  patientSummary: {
                    whatWeDiscussed: 'Rash',
                    yourConcerns: ['Rash'],
                    treatmentPlan: 'Cream',
                    followUp: '2 weeks',
                  },
                }),
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockGPT4Response);

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
      expect(result.chiefComplaint).toBe('Rash');
      expect(logger.info).toHaveBeenCalledWith(
        'Generating clinical note with OpenAI',
        expect.any(Object)
      );
    });

    it('should mask SSN/phone/email before Claude outbound payload while keeping clinical context', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const phiTranscript =
        'Patient SSN 123-45-6789, phone 415-555-1234, email jane.doe@example.com, with itchy rash on forearms.';
      const phiSegments: ambientAI.TranscriptionSegment[] = [
        {
          speaker: 'doctor',
          text: 'Please confirm your details and skin symptoms.',
          start: 0,
          end: 3,
          confidence: 0.95,
        },
        {
          speaker: 'patient',
          text: 'My SSN is 123-45-6789, phone 415-555-1234, email jane.doe@example.com, and I have an itchy rash.',
          start: 3,
          end: 9,
          confidence: 0.94,
        },
      ];

      const mockClaudeResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Itchy rash',
                hpi: 'Rash on forearms',
                ros: 'Skin positive for rash',
                physicalExam: 'Erythematous papules',
                assessment: 'Contact dermatitis',
                plan: 'Triamcinolone 0.1% cream',
                sectionConfidence: {
                  chiefComplaint: 0.92,
                  hpi: 0.9,
                  ros: 0.85,
                  physicalExam: 0.9,
                  assessment: 0.88,
                  plan: 0.9,
                },
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [],
                differentialDiagnoses: [],
                recommendedTests: [],
                patientSummary: {
                  whatWeDiscussed: 'Rash review',
                  yourConcerns: ['itchy rash'],
                  treatmentPlan: 'Topical steroid',
                  followUp: '2 weeks',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockClaudeResponse);

      await ambientAI.generateClinicalNote(phiTranscript, phiSegments);

      const requestBody = JSON.parse(
        ((global.fetch as jest.Mock).mock.calls[0]?.[1] as { body?: string }).body || '{}'
      );
      const prompt = String(requestBody?.messages?.[0]?.content || '');

      expect(prompt).not.toContain('123-45-6789');
      expect(prompt).not.toContain('415-555-1234');
      expect(prompt).not.toContain('jane.doe@example.com');
      expect(prompt).toContain('***-**-****');
      expect(prompt).toContain('***-***-****');
      expect(prompt).toContain('[EMAIL REDACTED]');
      expect(prompt.toLowerCase()).toContain('itchy rash');
    });

    it('should mask SSN/phone/email before OpenAI outbound payload while keeping clinical context', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.OPENAI_NOTE_MODEL = 'gpt-4o';

      const phiTranscript =
        'Patient SSN 123-45-6789, phone 415-555-1234, email jane.doe@example.com, reports itchy rash and scaling.';
      const phiSegments: ambientAI.TranscriptionSegment[] = [
        {
          speaker: 'doctor',
          text: 'Describe your symptoms and any exposures.',
          start: 0,
          end: 2,
          confidence: 0.95,
        },
        {
          speaker: 'patient',
          text: 'I have itchy rash and scaling; SSN 123-45-6789; phone 415-555-1234; email jane.doe@example.com.',
          start: 2,
          end: 8,
          confidence: 0.93,
        },
      ];

      const mockOpenAIResponse = {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  chiefComplaint: 'Itchy rash',
                  hpi: 'Rash with scaling',
                  ros: 'Skin positive for rash and scaling',
                  physicalExam: 'Scaly erythematous patches',
                  assessment: 'Dermatitis',
                  plan: 'Topical steroid and moisturizer',
                  sectionConfidence: {
                    chiefComplaint: 0.9,
                    hpi: 0.88,
                    ros: 0.84,
                    physicalExam: 0.89,
                    assessment: 0.86,
                    plan: 0.89,
                  },
                  suggestedIcd10: [],
                  suggestedCpt: [],
                  medications: [],
                  allergies: [],
                  followUpTasks: [],
                  differentialDiagnoses: [],
                  recommendedTests: [],
                  patientSummary: {
                    whatWeDiscussed: 'Rash and scaling',
                    yourConcerns: ['itchy rash'],
                    treatmentPlan: 'Apply treatment',
                    followUp: '2 weeks',
                  },
                }),
              },
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockOpenAIResponse);

      await ambientAI.generateClinicalNote(phiTranscript, phiSegments);

      const requestBody = JSON.parse(
        ((global.fetch as jest.Mock).mock.calls[0]?.[1] as { body?: string }).body || '{}'
      );
      const prompt = String(requestBody?.messages?.[1]?.content || '');

      expect(prompt).not.toContain('123-45-6789');
      expect(prompt).not.toContain('415-555-1234');
      expect(prompt).not.toContain('jane.doe@example.com');
      expect(prompt).toContain('***-**-****');
      expect(prompt).toContain('***-***-****');
      expect(prompt).toContain('[EMAIL REDACTED]');
      expect(prompt.toLowerCase()).toContain('itchy rash');
      expect(prompt.toLowerCase()).toContain('scaling');
    });

    it('should use agent configuration when provided', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const agentConfig = {
        id: 'config-123',
        tenantId: 'tenant-123',
        name: 'Custom Config',
        aiModel: 'claude-opus-4',
        temperature: 0.5,
        maxTokens: 5000,
        systemPrompt: 'Custom system prompt',
        promptTemplate: 'Custom template {{transcript}}',
        noteSections: ['chiefComplaint', 'assessment'],
        sectionPrompts: {},
        outputFormat: 'narrative',
        verbosityLevel: 'detailed',
        includeCodes: true,
        terminologySet: {},
        focusAreas: [],
        defaultCptCodes: [],
        defaultIcd10Codes: [],
        taskTemplates: [],
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Test',
                assessment: 'Test',
                sectionConfidence: { chiefComplaint: 0.9, assessment: 0.9 },
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [],
                differentialDiagnoses: [],
                recommendedTests: [],
                patientSummary: {
                  whatWeDiscussed: '',
                  yourConcerns: [],
                  treatmentPlan: '',
                  followUp: '',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      await ambientAI.generateClinicalNote(transcriptText, segments, agentConfig);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('claude-opus-4'),
        })
      );
    });

    it('should handle API errors and fallback to mock', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result).toHaveProperty('chiefComplaint');
      expect(logger.warn).toHaveBeenCalledWith(
        'AI note generation failed, falling back to mock',
        expect.objectContaining({ error: 'API Error' })
      );
    });

    it('redacts PHI in API error logs before fallback', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Provider failure for SSN 123-45-6789 and email jane.doe@example.com')
      );

      await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(logger.warn).toHaveBeenCalledWith(
        'AI note generation failed, falling back to mock',
        expect.objectContaining({
          error: expect.not.stringContaining('123-45-6789'),
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'AI note generation failed, falling back to mock',
        expect.objectContaining({
          error: expect.not.stringContaining('jane.doe@example.com'),
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'AI note generation failed, falling back to mock',
        expect.objectContaining({
          error: expect.stringContaining('[SSN-REDACTED]'),
        })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'AI note generation failed, falling back to mock',
        expect.objectContaining({
          error: expect.stringContaining('[EMAIL-REDACTED]'),
        })
      );
    });

    it('should parse AI response with markdown code blocks', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: '```json\n{"chiefComplaint":"Test","sectionConfidence":{},"suggestedIcd10":[],"suggestedCpt":[],"medications":[],"allergies":[],"followUpTasks":[],"differentialDiagnoses":[],"recommendedTests":[],"patientSummary":{"whatWeDiscussed":"","yourConcerns":[],"treatmentPlan":"","followUp":""}}\n```',
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result.chiefComplaint).toBe('Test');
    });

    it('should normalize differential probabilities and summary concerns from imperfect AI JSON', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Itchy rash on forearms',
                hpi: 'Patient has itchy red rash with scaling.',
                ros: 'Negative except skin',
                physicalExam: 'Erythematous plaques',
                assessment: 'Dermatitis',
                plan: 'Topical steroid and follow-up in 2 weeks.',
                sectionConfidence: {
                  chiefComplaint: 90,
                  hpi: 85,
                  ros: 80,
                  physicalExam: 88,
                  assessment: 83,
                  plan: 87,
                },
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [{ task: 'Return visit', priority: 'medium', dueDate: '2026-03-01', confidence: 0.9 }],
                differentialDiagnoses: [
                  { condition: 'Allergic contact dermatitis', confidence: 70, reasoning: 'Detergent trigger', icd10Code: 'L23.9' },
                  { condition: 'Irritant contact dermatitis', confidence: 20, reasoning: 'Irritant exposure', icd10Code: 'L24.9' },
                  { condition: 'Atopic dermatitis', confidence: 10, reasoning: 'Eczematous features', icd10Code: 'L20.9' },
                ],
                recommendedTests: [
                  { testName: 'Patch testing', rationale: 'Identify culprit allergen', urgency: 'STAT', cptCode: '95044' }
                ],
                patientSummary: {
                  whatWeDiscussed: 'We discussed rash symptoms.',
                  yourConcerns: [],
                  treatmentPlan: '',
                  followUp: '',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result.differentialDiagnoses.length).toBeGreaterThanOrEqual(3);
      const totalProbability = result.differentialDiagnoses
        .reduce((sum, diagnosis) => sum + diagnosis.confidence, 0);
      expect(totalProbability).toBeCloseTo(1, 2);
      expect(result.differentialDiagnoses[0].confidence).toBeGreaterThan(result.differentialDiagnoses[1].confidence);
      expect(result.recommendedTests[0]?.urgency).toBe('routine');
      expect(result.patientSummary.yourConcerns.length).toBeGreaterThan(0);
    });

    it('should handle malformed JSON from AI', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ text: 'Not valid JSON' }],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result).toHaveProperty('chiefComplaint');
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to parse AI note, using fallback',
        expect.any(Object)
      );
    });

    it('should fallback from malformed AI JSON with doctor/patient speaker labels', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ text: '{ malformed' }],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote(transcriptText, doctorPatientSegments);

      expect(result.chiefComplaint.toLowerCase()).toContain('rash');
      expect(result.medications.some((med) => med.name.toLowerCase().includes('triamcinolone'))).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to parse AI note, using fallback',
        expect.any(Object)
      );
    });

    it('should calculate overall confidence from section scores', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result.overallConfidence).toBeGreaterThan(0);
      expect(result.overallConfidence).toBeLessThanOrEqual(1);
    });

    it('should extract ICD-10 codes', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(Array.isArray(result.suggestedIcd10)).toBe(true);
    });

    it('should extract CPT codes', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(Array.isArray(result.suggestedCpt)).toBe(true);
    });

    it('should extract medications', async () => {
      const medSegments: ambientAI.TranscriptionSegment[] = [
        {
          speaker: 'speaker_0',
          text: 'I will prescribe triamcinolone 0.1% cream to apply twice daily.',
          start: 0,
          end: 5,
          confidence: 0.95,
        },
      ];

      const result = await ambientAI.generateClinicalNote(
        'triamcinolone prescription',
        medSegments
      );

      expect(Array.isArray(result.medications)).toBe(true);
    });

    it('should extract allergies', async () => {
      const allergySegments: ambientAI.TranscriptionSegment[] = [
        {
          speaker: 'speaker_1',
          text: 'I am allergic to penicillin, I get hives.',
          start: 0,
          end: 3,
          confidence: 0.95,
        },
      ];

      const result = await ambientAI.generateClinicalNote(
        'penicillin allergy',
        allergySegments
      );

      expect(Array.isArray(result.allergies)).toBe(true);
    });

    it('should extract follow-up tasks', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(Array.isArray(result.followUpTasks)).toBe(true);
    });

    it('should generate differential diagnoses', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(Array.isArray(result.differentialDiagnoses)).toBe(true);
    });

    it('should generate recommended tests', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(Array.isArray(result.recommendedTests)).toBe(true);
    });

    it('should generate patient summary', async () => {
      const result = await ambientAI.generateClinicalNote(transcriptText, segments);

      expect(result.patientSummary).toHaveProperty('whatWeDiscussed');
      expect(result.patientSummary).toHaveProperty('yourConcerns');
      expect(result.patientSummary).toHaveProperty('treatmentPlan');
      expect(result.patientSummary).toHaveProperty('followUp');
      expect(Array.isArray(result.patientSummary.yourConcerns)).toBe(true);
    });
  });

  describe('maskPHI', () => {
    it('should mask phone numbers', () => {
      const text = 'Call me at 555-123-4567 or 555.987.6543';
      const phiEntities: ambientAI.PHIEntity[] = [
        {
          type: 'phone',
          text: '555-123-4567',
          start: 11,
          end: 23,
          masked_value: '***-***-****',
        },
        {
          type: 'phone',
          text: '555.987.6543',
          start: 27,
          end: 39,
          masked_value: '***-***-****',
        },
      ];

      const result = ambientAI.maskPHI(text, phiEntities);

      expect(result).toContain('***-***-****');
      expect(result).not.toContain('555-123-4567');
      expect(result).not.toContain('555.987.6543');
    });

    it('should mask dates', () => {
      const text = 'Date of birth is 01/15/1990';
      const phiEntities: ambientAI.PHIEntity[] = [
        {
          type: 'date',
          text: '01/15/1990',
          start: 17,
          end: 27,
          masked_value: '**/**/****',
        },
      ];

      const result = ambientAI.maskPHI(text, phiEntities);

      expect(result).toContain('**/**/****');
      expect(result).not.toContain('01/15/1990');
    });

    it('should return original text when no PHI entities', () => {
      const text = 'No PHI here';
      const result = ambientAI.maskPHI(text, []);

      expect(result).toBe(text);
    });

    it('should mask multiple entities correctly', () => {
      const text = 'John Doe, DOB 01/15/1990, phone 555-1234';
      const phiEntities: ambientAI.PHIEntity[] = [
        {
          type: 'date',
          text: '01/15/1990',
          start: 14,
          end: 24,
          masked_value: '**/**/****',
        },
        {
          type: 'phone',
          text: '555-1234',
          start: 32,
          end: 40,
          masked_value: '***-****',
        },
      ];

      const result = ambientAI.maskPHI(text, phiEntities);

      expect(result).toContain('**/**/****');
      expect(result).toContain('***-****');
    });
  });

  describe('Mock data generation', () => {
    it('should generate realistic chief complaint', async () => {
      const segments: ambientAI.TranscriptionSegment[] = [
        {
          speaker: 'speaker_1',
          text: 'I have a rash on my arms that is very itchy.',
          start: 0,
          end: 3,
          confidence: 0.95,
        },
      ];

      const result = await ambientAI.generateClinicalNote('rash itchy arms', segments);

      expect(result.chiefComplaint).toBeTruthy();
      expect(result.chiefComplaint.length).toBeGreaterThan(0);
    });

    it('should generate HPI with OLDCARTS format', async () => {
      const result = await ambientAI.generateClinicalNote('rash', []);

      expect(result.hpi).toContain('ONSET');
      expect(result.hpi).toContain('LOCATION');
      expect(result.hpi).toContain('DURATION');
      expect(result.hpi).toContain('CHARACTER');
    });

    it('should generate complete ROS', async () => {
      const result = await ambientAI.generateClinicalNote('test', []);

      expect(result.ros).toContain('CONSTITUTIONAL');
      expect(result.ros).toContain('SKIN');
    });

    it('should generate physical exam with dermatologic terms', async () => {
      const result = await ambientAI.generateClinicalNote('test', []);

      expect(result.physicalExam).toBeTruthy();
      expect(result.physicalExam.length).toBeGreaterThan(0);
    });

    it('should generate assessment with diagnosis', async () => {
      const result = await ambientAI.generateClinicalNote('test', []);

      expect(result.assessment).toBeTruthy();
      expect(result.assessment.length).toBeGreaterThan(0);
    });

    it('should generate plan with medications and instructions', async () => {
      const result = await ambientAI.generateClinicalNote('test', []);

      expect(result.plan).toBeTruthy();
      expect(result.plan.length).toBeGreaterThan(0);
    });
  });

  describe('Agent configuration integration', () => {
    it('should use custom sections from config', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const config = {
        id: 'config-123',
        tenantId: 'tenant-123',
        name: 'Custom',
        aiModel: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'System',
        promptTemplate: 'Template {{transcript}}',
        noteSections: ['customSection1', 'customSection2'],
        sectionPrompts: {},
        outputFormat: 'soap',
        verbosityLevel: 'standard',
        includeCodes: true,
        terminologySet: {},
        focusAreas: [],
        defaultCptCodes: [],
        defaultIcd10Codes: [],
        taskTemplates: [],
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                customSection1: 'Content 1',
                customSection2: 'Content 2',
                sectionConfidence: {},
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [],
                differentialDiagnoses: [],
                recommendedTests: [],
                patientSummary: {
                  whatWeDiscussed: '',
                  yourConcerns: [],
                  treatmentPlan: '',
                  followUp: '',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote('test', [], config);

      expect(result).toHaveProperty('customSection1');
      expect(result).toHaveProperty('customSection2');
    });

    it('should add task templates from config', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const config = {
        id: 'config-123',
        tenantId: 'tenant-123',
        name: 'Config',
        aiModel: 'claude-3-5-sonnet-20241022',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'System',
        promptTemplate: 'Template {{transcript}}',
        noteSections: ['chiefComplaint'],
        sectionPrompts: {},
        outputFormat: 'soap',
        verbosityLevel: 'standard',
        includeCodes: true,
        terminologySet: {},
        focusAreas: [],
        defaultCptCodes: [],
        defaultIcd10Codes: [],
        taskTemplates: [
          {
            task: 'Review labs',
            priority: 'high',
            daysFromVisit: 3,
          },
        ],
        isDefault: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            {
              text: JSON.stringify({
                chiefComplaint: 'Test',
                sectionConfidence: {},
                suggestedIcd10: [],
                suggestedCpt: [],
                medications: [],
                allergies: [],
                followUpTasks: [],
                differentialDiagnoses: [],
                recommendedTests: [],
                patientSummary: {
                  whatWeDiscussed: '',
                  yourConcerns: [],
                  treatmentPlan: '',
                  followUp: '',
                },
              }),
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await ambientAI.generateClinicalNote('test', [], config);

      const reviewLabTask = result.followUpTasks.find((t) => t.task === 'Review labs');
      expect(reviewLabTask).toBeDefined();
      expect(reviewLabTask?.priority).toBe('high');
    });
  });
});
