import {
  arePhoneNumbersEqual,
  extractCountryCode,
  formatPhoneDisplay,
  formatPhoneE164,
  isLikelyUSMobile,
  isValidE164,
  maskPhoneNumber,
  sanitizePhoneNumber,
  validateAndFormatPhone,
} from '../phone';

describe('phone utilities', () => {
  it('formats numbers to E.164', () => {
    expect(formatPhoneE164('(555) 123-4567')).toBe('+15551234567');
    expect(formatPhoneE164('15551234567')).toBe('+15551234567');
    expect(formatPhoneE164('441234567890')).toBe('+441234567890');
    expect(formatPhoneE164(null)).toBeNull();
  });

  it('validates E.164 format', () => {
    expect(isValidE164('+15551234567')).toBe(true);
    expect(isValidE164('15551234567')).toBe(false);
    expect(isValidE164(null)).toBe(false);
  });

  it('formats display strings', () => {
    expect(formatPhoneDisplay('+15551234567')).toBe('(555) 123-4567');
    expect(formatPhoneDisplay('5551234567')).toBe('(555) 123-4567');
    expect(formatPhoneDisplay('invalid')).toBe('invalid');
  });

  it('sanitizes phone input', () => {
    expect(sanitizePhoneNumber(' (555) 123-4567 #$ ')).toBe('(555) 123-4567');
    expect(sanitizePhoneNumber(null)).toBe('');
  });

  it('extracts country codes', () => {
    expect(extractCountryCode('+441234567890')).toBe('+441');
    expect(extractCountryCode('5551234567')).toBe('+1');
  });

  it('compares phone numbers regardless of formatting', () => {
    expect(arePhoneNumbersEqual('(555) 123-4567', '5551234567')).toBe(true);
    expect(arePhoneNumbersEqual('5551234567', null)).toBe(false);
  });

  it('validates and formats phone numbers', () => {
    expect(validateAndFormatPhone('(555) 123-4567')).toBe('+15551234567');
    expect(() => validateAndFormatPhone('bad')).toThrow('Invalid phone number format');
  });

  it('checks for likely US mobile numbers', () => {
    expect(isLikelyUSMobile('(555) 123-4567')).toBe(true);
    expect(isLikelyUSMobile('+441234567890')).toBe(false);
  });

  it('masks phone numbers for display', () => {
    expect(maskPhoneNumber('+15551234567')).toBe('(555) ***-4567');
    expect(maskPhoneNumber(null)).toBe('');
  });
});
