import { askClinicalCopilot } from '../clinicalCopilot';
import { AiPhiBlockError } from '../../utils/aiPhiGuard';

describe('clinicalCopilot', () => {
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;
  const originalHipaaAiEnabled = process.env.HIPAA_AI_ENABLED;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.HIPAA_AI_ENABLED;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalOpenAI === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAI;
    }

    if (originalAnthropic === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropic;
    }

    if (originalHipaaAiEnabled === undefined) {
      delete process.env.HIPAA_AI_ENABLED;
    } else {
      process.env.HIPAA_AI_ENABLED = originalHipaaAiEnabled;
    }

    global.fetch = originalFetch;
  });

  it('returns a grounded mock E/M answer when no live provider key is configured', async () => {
    const result = await askClinicalCopilot({
      question: 'What office visit code fits this encounter best and why?',
      context: {
        encounterId: 'enc-1',
        patientId: 'pat-1',
        encounter: {
          chiefComplaint: 'Itchy scalp rash',
          hpi: 'Patient reports scalp itching and flaking for several months.',
          assessmentPlan: 'Seborrheic dermatitis. Start ketoconazole 2% shampoo and provide counseling.',
        },
        note: {
          assessment: 'Seborrheic dermatitis of the scalp.',
          plan: 'Prescription ketoconazole 2% shampoo twice weekly. Counseling on chronic flares and follow-up as needed.',
          suggestedCptCodes: [
            { code: '99213', description: 'Established patient office visit, low medical decision making', confidence: 0.77 },
          ],
          suggestedIcd10Codes: [
            { code: 'L21.8', description: 'Other seborrheic dermatitis', confidence: 0.91 },
          ],
          followUpTasks: [
            { task: 'Follow up if symptoms persist after several weeks', priority: 'medium' },
          ],
          patientSummary: {
            whatWeDiscussed: 'Discussed scalp scaling and itching consistent with seborrheic dermatitis.',
            treatmentPlan: 'Use ketoconazole shampoo 2 to 3 times weekly and monitor for improvement.',
            followUp: 'Return if symptoms worsen or fail to improve.',
          },
        },
      },
    });

    expect(result.provider).toBe('mock');
    expect(result.answer).toMatch(/99213|99214/);
    expect(result.suggestedCodes.some((item) => item.code === '99213')).toBe(true);
    expect(result.chartEvidence.length).toBeGreaterThan(0);
    expect(result.followUpTasks[0]).toMatch(/Follow up/i);
  });

  it('blocks direct patient identifiers before a live AI call', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    await expect(askClinicalCopilot({
      question: 'Patient name: James Ward has acne. What code should I use?',
      context: {},
    })).rejects.toBeInstanceOf(AiPhiBlockError);
  });

  it('de-identifies chart context before sending it to a live AI provider', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              answer: 'Use dermatitis coding if supported.',
              visitSummary: 'Itchy rash visit.',
              suggestedCodes: [],
              followUpTasks: [],
              patientInstructions: [],
              missingData: [],
              chartEvidence: ['itchy plaques'],
            }),
          },
        }],
      }),
    });
    global.fetch = fetchMock as any;

    await askClinicalCopilot({
      question: 'What documentation gaps should I fix?',
      context: {
        encounter: {
          hpi: 'Patient name: James Ward reports itchy plaques on elbows. DOB 01/02/1980.',
        },
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const serialized = JSON.stringify(body);
    expect(serialized).toContain('[PATIENT NAME REDACTED]');
    expect(serialized).toContain('itchy plaques on elbows');
    expect(serialized).not.toContain('James Ward');
    expect(serialized).not.toContain('01/02/1980');
  });
});
