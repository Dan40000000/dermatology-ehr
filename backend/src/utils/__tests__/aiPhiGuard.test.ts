import {
  AiPhiBlockError,
  assertNoBlockedPhiForExternalAi,
  deidentifyTextForExternalAi,
  scanAiPhi,
} from '../aiPhiGuard';

describe('AI PHI guard', () => {
  const originalHipaaAiEnabled = process.env.HIPAA_AI_ENABLED;
  const originalClinicalPhiAllowed = process.env.CLINICAL_AI_PHI_ALLOWED;
  const originalOpenAiBaaEnabled = process.env.OPENAI_BAA_ENABLED;

  beforeEach(() => {
    delete process.env.HIPAA_AI_ENABLED;
    delete process.env.CLINICAL_AI_PHI_ALLOWED;
    delete process.env.OPENAI_BAA_ENABLED;
  });

  afterAll(() => {
    if (originalHipaaAiEnabled === undefined) delete process.env.HIPAA_AI_ENABLED;
    else process.env.HIPAA_AI_ENABLED = originalHipaaAiEnabled;

    if (originalClinicalPhiAllowed === undefined) delete process.env.CLINICAL_AI_PHI_ALLOWED;
    else process.env.CLINICAL_AI_PHI_ALLOWED = originalClinicalPhiAllowed;

    if (originalOpenAiBaaEnabled === undefined) delete process.env.OPENAI_BAA_ENABLED;
    else process.env.OPENAI_BAA_ENABLED = originalOpenAiBaaEnabled;
  });

  it('detects explicit names, DOBs, contact information, and distinctive identifiers', () => {
    const text = 'Patient name: James Ward DOB 01/02/1980 phone 303-555-1212 has a distinctive neck tattoo.';
    const entities = scanAiPhi(text);

    expect(entities.map((entity) => entity.type)).toEqual(expect.arrayContaining([
      'explicit_name',
      'dob',
      'phone',
      'unique_physical_identifier',
    ]));
  });

  it('redacts identifiers but preserves clinical facts', () => {
    const result = deidentifyTextForExternalAi(
      'Patient name: James Ward has itchy plaques on the elbows and an insurance ID ABC123456.'
    );

    expect(result.text).toContain('[PATIENT NAME REDACTED]');
    expect(result.text).toContain('[INSURANCE ID REDACTED]');
    expect(result.text).toContain('itchy plaques on the elbows');
  });

  it('blocks high-risk identifiers when HIPAA AI mode is not enabled', () => {
    expect(() => assertNoBlockedPhiForExternalAi('Patient name: James Ward has acne.')).toThrow(AiPhiBlockError);
    expect(() => assertNoBlockedPhiForExternalAi('DOB 01/02/1980 and email james@example.com.')).toThrow(AiPhiBlockError);
  });

  it('allows identifiers only when HIPAA AI mode is explicitly enabled', () => {
    process.env.HIPAA_AI_ENABLED = 'true';

    expect(() => assertNoBlockedPhiForExternalAi('Patient name: James Ward has acne.')).not.toThrow();
  });
});
