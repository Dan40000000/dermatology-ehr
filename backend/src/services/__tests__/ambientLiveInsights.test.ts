import { generateAmbientLiveInsights, inferLiveSpeakerRole } from '../ambientLiveInsights';

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

  it('surfaces melanoma-rule-out safety flags, biopsy workflow, and documentation gaps live', () => {
    const result = generateAmbientLiveInsights([
      'Patient: I noticed a dark mole on my upper back that has been changing for two months.',
      'Patient: It started bleeding last week and it has an irregular border.',
      'Doctor: On exam there is an asymmetric black papule with variegated pigment.',
      'Doctor: I recommend dermoscopy, clinical photography, and a shave biopsy for pathology review.',
    ]);

    expect(result.visitSummary.oneLiner).toMatch(/melanoma|pigmented lesion|skin cancer/i);
    expect(result.symptoms.some((item) => item.label.includes('Changing mole'))).toBe(true);
    expect(result.workingDiagnoses.some((item) => /melanoma/i.test(item.condition))).toBe(true);
    expect(result.safetyFlags.some((item) => item.label === 'Skin cancer warning features' && item.severity === 'urgent')).toBe(true);
    expect(result.clinicalActions.some((item) => item.label === 'Prepare biopsy workflow' && item.urgency === 'urgent')).toBe(true);
    expect(result.suggestedTests.map((item) => item.testName)).toEqual(
      expect.arrayContaining(['Shave/tangential biopsy with dermatopathology', 'Dermoscopy / lesion photography', 'Pathology review'])
    );
  });

  it('captures cheek actinic keratosis plus shoulder biopsy without treating cryotherapy as a test', () => {
    const result = generateAmbientLiveInsights([
      'Clinician: What brought you in today?',
      'Patient: I have a rough flaky spot on my left cheek that keeps coming back and feels tender when I shave.',
      'Patient: My wife also noticed a darker mole on my right shoulder that has changed a little. It does not bleed and it is not growing fast.',
      'Clinician: On exam the cheek has a gritty scaly patch consistent with actinic keratosis.',
      'Clinician: I recommend liquid nitrogen for the cheek and a shave biopsy of the right shoulder mole with pathology review.',
    ]);

    expect(result.symptoms.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Rough / gritty sun-damage spot', 'Changing mole / pigmented lesion'])
    );
    expect(result.symptoms.some((item) => item.label === 'Bleeding')).toBe(false);
    expect(result.workingDiagnoses.map((item) => item.icd10Code)).toEqual(expect.arrayContaining(['L57.0', 'D48.5']));
    expect(result.suggestedTests.some((item) =>
      item.testName === 'Shave/tangential biopsy with dermatopathology' && item.cptCode === '11102'
    )).toBe(true);
    expect(result.suggestedTests.some((item) => /cryotherapy|liquid nitrogen/i.test(item.testName))).toBe(false);
    expect(result.clinicalActions.some((item) => item.label === 'Document cryotherapy treatment')).toBe(true);
  });

  it('builds a live acne/isotretinoin snapshot with safety requirements and labs', () => {
    const result = generateAmbientLiveInsights(
      'Patient says my acne has deep painful cysts on the jaw and chest with scarring. Doctor says we may discuss isotretinoin or Accutane after baseline labs.'
    );

    expect(result.workingDiagnoses.some((item) => /acne/i.test(item.condition))).toBe(true);
    expect(result.medications.some((item) => item.name === 'Isotretinoin')).toBe(true);
    expect(result.safetyFlags.some((item) => item.label === 'Isotretinoin safety requirements')).toBe(true);
    expect(result.suggestedTests.map((item) => item.testName)).toEqual(
      expect.arrayContaining(['Lipid panel', 'Hepatic function panel', 'Pregnancy test if applicable'])
    );
  });

  it('tracks biologic safety screening when psoriasis systemic therapy is discussed', () => {
    const result = generateAmbientLiveInsights(
      'Patient reports thick scaly plaques on elbows and scalp with joint stiffness. Doctor recommends considering Skyrizi biologic therapy after TB screening and hepatitis panel.'
    );

    expect(result.workingDiagnoses.some((item) => item.condition === 'Psoriasis')).toBe(true);
    expect(result.medications.some((item) => item.name === 'Skyrizi')).toBe(true);
    expect(result.safetyFlags.map((item) => item.label)).toEqual(
      expect.arrayContaining(['Systemic therapy safety screening', 'Possible psoriatic arthritis symptoms'])
    );
    expect(result.suggestedTests.map((item) => item.testName)).toEqual(
      expect.arrayContaining(['CBC / CMP baseline labs', 'TB screening and hepatitis panel'])
    );
  });

  it('infers live transcript speaker labels for provider and patient snippets', () => {
    expect(inferLiveSpeakerRole('Patient: I have an itchy rash on my hands')).toBe('patient');
    expect(inferLiveSpeakerRole('I recommend starting triamcinolone twice daily.')).toBe('provider');
    expect(inferLiveSpeakerRole('Exam shows erythematous plaques along the hairline.')).toBe('provider');
  });

  it('does not promote denied or wound-care warning symptoms as live symptoms', () => {
    const result = generateAmbientLiveInsights([
      'Patient: The mole is getting darker and catching on my shirt.',
      'Patient: It does not hurt and there has been no pus or drainage.',
      'Doctor: We will biopsy it today. After the biopsy, call us if you notice pain, pus, drainage, or fever.',
    ]);

    expect(result.symptoms.some((item) => item.label === 'Changing mole / pigmented lesion')).toBe(true);
    expect(result.symptoms.some((item) => /pain|drainage|fever/i.test(item.label))).toBe(false);
  });
});
