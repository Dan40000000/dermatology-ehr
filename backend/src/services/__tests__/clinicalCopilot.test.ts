import { askClinicalCopilot } from '../clinicalCopilot';

describe('clinicalCopilot', () => {
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
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
});
