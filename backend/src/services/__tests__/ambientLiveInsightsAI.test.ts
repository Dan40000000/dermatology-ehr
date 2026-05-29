import { generateAmbientLiveInsights } from '../ambientLiveInsights';
import { generateAmbientLiveInsightsWithAI } from '../ambientLiveInsightsAI';
import { resetOpenAiSpendGuardForTests } from '../../utils/openAiSpendGuard';

describe('ambientLiveInsightsAI', () => {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalLiveModel = process.env.OPENAI_LIVE_INSIGHTS_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    resetOpenAiSpendGuardForTests();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_LIVE_INSIGHTS_MODEL = 'gpt-4o-mini';
    (global.fetch as jest.Mock | undefined)?.mockReset?.();
  });

  afterAll(() => {
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }

    if (originalLiveModel === undefined) {
      delete process.env.OPENAI_LIVE_INSIGHTS_MODEL;
    } else {
      process.env.OPENAI_LIVE_INSIGHTS_MODEL = originalLiveModel;
    }
  });

  it('returns heuristic insights when transcript is too short for AI enhancement', async () => {
    const result = await generateAmbientLiveInsightsWithAI('itchy scalp');

    expect(result.source).toBe('heuristic');
    expect(result.visitSummary.oneLiner).toMatch(/itching|differential|waiting|clinical conversation/i);
  });

  it('upgrades heuristic insights with OpenAI live summary output', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                visitSummary: {
                  oneLiner: 'Changing pigmented lesion with melanoma in the working differential.',
                  patientReported: ['Patient reports a changing dark mole on the upper back for two months.'],
                  providerObserved: ['Exam shows an asymmetric dark papule with irregular pigment.'],
                  planDraft: ['Plan shave biopsy and pathology review.'],
                  documentationGaps: ['Confirm family history of melanoma.'],
                },
                symptoms: [
                  {
                    label: 'Changing lesion / mole concern',
                    confidence: 0.94,
                    evidence: 'changing dark mole on the upper back',
                  },
                ],
                workingDiagnoses: [
                  {
                    condition: 'Suspicious pigmented lesion / melanoma rule-out',
                    confidence: 0.82,
                    reasoning: 'Changing dark lesion with irregular pigment and recent bleeding.',
                    icd10Code: 'D48.5',
                  },
                ],
                suggestedTests: [
                  {
                    testName: 'Skin biopsy',
                    urgency: 'urgent',
                    rationale: 'Required to confirm the diagnosis of a changing pigmented lesion.',
                  },
                ],
                medications: [],
                clinicalActions: [
                  {
                    label: 'Prepare biopsy workflow',
                    type: 'procedure',
                    urgency: 'urgent',
                    status: 'planned',
                    rationale: 'Biopsy is needed based on the live transcript.',
                  },
                ],
                safetyFlags: [
                  {
                    label: 'Skin cancer warning features',
                    severity: 'urgent',
                    rationale: 'Changing irregular pigmented lesion with bleeding needs prompt review.',
                  },
                ],
              }),
            },
          },
        ],
      }),
    } as any);

    const heuristic = generateAmbientLiveInsights([
      'Patient: I noticed a dark mole on my upper back that has been changing for two months.',
      'Patient: It bled last week.',
      'Doctor: On exam there is an asymmetric dark papule with irregular pigment.',
      'Doctor: We should do a shave biopsy and send it to pathology.',
    ]);

    const result = await generateAmbientLiveInsightsWithAI(
      [
        'Patient: I noticed a dark mole on my upper back that has been changing for two months.',
        'Patient: It bled last week.',
        'Doctor: On exam there is an asymmetric dark papule with irregular pigment.',
        'Doctor: We should do a shave biopsy and send it to pathology.',
      ],
      { fallback: heuristic }
    );

    expect(result.source).toBe('openai');
    expect(result.visitSummary.oneLiner).toMatch(/melanoma/i);
    expect(result.workingDiagnoses[0]?.condition).toMatch(/melanoma/i);
    expect(result.workingDiagnoses[0]?.confidence).toBeCloseTo(0.82, 2);
    expect(result.suggestedTests[0]?.testName).toBe('Shave/tangential biopsy with dermatopathology');
    expect(result.suggestedTests[0]?.cptCode).toBe('11102');
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('falls back to heuristic insights when OpenAI is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    } as any);

    const transcript = [
      'Patient: I noticed a dark mole on my upper back that has been changing for two months.',
      'Doctor: We should do a shave biopsy and send it to pathology.',
    ];
    const heuristic = generateAmbientLiveInsights(transcript);

    const result = await generateAmbientLiveInsightsWithAI(transcript, { fallback: heuristic });

    expect(result).toBe(heuristic);
    expect(result.source).toBe('heuristic');
  });

  it('redacts obvious identifiers before sending live transcript context to OpenAI', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                visitSummary: {
                  oneLiner: 'Changing pigmented lesion needs biopsy planning.',
                  patientReported: ['Patient reports changing lesion.'],
                  providerObserved: ['Provider notes irregular pigment.'],
                  planDraft: ['Plan biopsy.'],
                  documentationGaps: [],
                },
                symptoms: [],
                workingDiagnoses: [],
                suggestedTests: [],
                medications: [],
                clinicalActions: [],
                safetyFlags: [],
              }),
            },
          },
        ],
      }),
    } as any);

    const transcript = [
      'Patient: My name is Jane Smith and my DOB is 01/02/1980.',
      'Patient: My email is jane.smith@example.com, phone 555-222-3333, SSN 123-45-6789.',
      'Patient: I live at 123 Main Street and have a changing mole on my upper back that bled last week.',
      'Doctor: On exam there is an asymmetric dark papule with irregular pigment, so we should do a shave biopsy and send pathology.',
    ];

    await generateAmbientLiveInsightsWithAI(transcript, {
      fallback: generateAmbientLiveInsights(transcript),
    });

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const userPrompt = requestBody.messages.find((message: any) => message.role === 'user')?.content || '';

    expect(userPrompt).not.toContain('Jane Smith');
    expect(userPrompt).not.toContain('jane.smith@example.com');
    expect(userPrompt).not.toContain('555-222-3333');
    expect(userPrompt).not.toContain('123-45-6789');
    expect(userPrompt).not.toContain('01/02/1980');
    expect(userPrompt).not.toContain('123 Main Street');
    expect(userPrompt).toContain('[NAME-REDACTED]');
    expect(userPrompt).toContain('[EMAIL-REDACTED]');
    expect(userPrompt).toContain('[PHONE-REDACTED]');
    expect(userPrompt).toContain('[SSN-REDACTED]');
    expect(userPrompt).toContain('[DATE-REDACTED]');
    expect(userPrompt).toContain('[ADDRESS-REDACTED]');
    expect(userPrompt).toMatch(/changing mole|shave biopsy/i);
  });
});
