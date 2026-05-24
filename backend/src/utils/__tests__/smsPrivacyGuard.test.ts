import {
  assertSmsContentSafe,
  isSmsPhiContentAllowed,
  normalizeSmsTemplateForMinimumNecessary,
  scanSmsPrivacyRisks,
  SmsPrivacyBlockError,
} from '../smsPrivacyGuard';

describe('smsPrivacyGuard', () => {
  const originalAllowPhi = process.env.SMS_ALLOW_PHI_CONTENT;

  beforeEach(() => {
    delete process.env.SMS_ALLOW_PHI_CONTENT;
  });

  afterEach(() => {
    if (originalAllowPhi === undefined) {
      delete process.env.SMS_ALLOW_PHI_CONTENT;
    } else {
      process.env.SMS_ALLOW_PHI_CONTENT = originalAllowPhi;
    }
  });

  it('allows minimum necessary appointment reminders', () => {
    expect(() =>
      assertSmsContentSafe('Hi Pat, this is a reminder for your appointment on Monday at 9:30 AM. Reply C to confirm.')
    ).not.toThrow();
  });

  it('blocks clinical details and unsafe template variables', () => {
    const risks = scanSmsPrivacyRisks('Hi {patientName}, your biopsy pathology result and ICD10 diagnosis are ready.');

    expect(risks.map((risk) => risk.type)).toEqual(
      expect.arrayContaining(['unsafe_template_variable', 'clinical_detail'])
    );
  });

  it('throws a structured error when SMS contains identifiers', () => {
    expect(() => assertSmsContentSafe('DOB 01/02/1980 MRN A12345')).toThrow(SmsPrivacyBlockError);

    try {
      assertSmsContentSafe('DOB 01/02/1980 MRN A12345');
    } catch (error) {
      expect(error).toBeInstanceOf(SmsPrivacyBlockError);
      expect((error as SmsPrivacyBlockError).code).toBe('SMS_PHI_BLOCKED');
      expect((error as SmsPrivacyBlockError).blockedTypes).toEqual(expect.arrayContaining(['dob', 'mrn']));
    }
  });

  it('allows office phone numbers in administrative SMS content', () => {
    expect(() => assertSmsContentSafe('Please call our office at 555-123-4567 if you need to reschedule.')).not.toThrow();
  });

  it('normalizes legacy name/provider template variables before automated reminders send', () => {
    const normalized = normalizeSmsTemplateForMinimumNecessary(
      'Hi {patientName}, your appointment is with {providerName} on {appointmentDate}.'
    );

    expect(normalized).toBe('Hi {firstName}, your appointment is with your provider on {appointmentDate}.');
    expect(() => assertSmsContentSafe(normalized)).not.toThrow();
  });

  it('can be explicitly bypassed for future approved workflows', () => {
    process.env.SMS_ALLOW_PHI_CONTENT = 'true';

    expect(isSmsPhiContentAllowed()).toBe(true);
    expect(() => assertSmsContentSafe('Diagnosis: melanoma. MRN A12345.')).not.toThrow();
  });
});
