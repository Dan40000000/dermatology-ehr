import { generateAmbientLiveInsights } from '../ambientLiveInsights';

describe('ambientLiveInsights', () => {
  it('suggests dermatitis-style symptoms, differential, and tests from trigger-heavy rash history', () => {
    const result = generateAmbientLiveInsights(
      'Patient says she has an itchy red rash on the hands after using a new detergent and hand sanitizer. The skin is dry and cracking.'
    );

    expect(result.symptoms.some((item) => item.label.includes('Itching'))).toBe(true);
    expect(result.symptoms.some((item) => item.label.includes('Rash'))).toBe(true);
    expect(result.workingDiagnoses.some((item) => item.condition.includes('contact dermatitis'))).toBe(true);
    expect(result.suggestedTests.some((item) => item.testName === 'Patch testing')).toBe(true);
  });

  it('suggests hair-loss labs when transcript sounds like alopecia or telogen effluvium', () => {
    const result = generateAmbientLiveInsights(
      'Patient reports diffuse hair shedding for three months after illness and stress. She notices thinning hair and ongoing hair loss.'
    );

    expect(result.symptoms.some((item) => item.label.includes('Hair loss'))).toBe(true);
    expect(result.workingDiagnoses.some((item) => /alopecia|telogen/i.test(item.condition))).toBe(true);
    expect(result.suggestedTests.map((item) => item.testName)).toEqual(
      expect.arrayContaining(['CBC', 'Ferritin / iron studies', 'TSH'])
    );
  });
});
