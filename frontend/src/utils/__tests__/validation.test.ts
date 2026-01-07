import { renderHook, act } from '@testing-library/react';
import {
  Rules,
  MedicalRules,
  validateField,
  validateForm,
  hasErrors,
  formatErrorMessage,
  useFormValidation,
} from '../validation';

describe('validation rules', () => {
  it('validates common rules', () => {
    expect(Rules.required().validate('')).toBe(false);
    expect(Rules.required().validate('ok')).toBe(true);
    expect(Rules.required().validate([])).toBe(false);
    expect(Rules.required().validate([1])).toBe(true);

    expect(Rules.email().validate('bad-email')).toBe(false);
    expect(Rules.email().validate('test@example.com')).toBe(true);
    expect(Rules.email().validate('')).toBe(true);

    expect(Rules.phone().validate('123-456-7890')).toBe(true);
    expect(Rules.phone().validate('+1 123 456 7890')).toBe(true);
    expect(Rules.phone().validate('not-a-phone')).toBe(false);

    expect(Rules.date().validate('2020-01-01')).toBe(true);
    expect(Rules.date().validate('bad-date')).toBe(false);

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(Rules.pastDate().validate(yesterday)).toBe(true);
    expect(Rules.pastDate().validate(tomorrow)).toBe(false);
    expect(Rules.futureDate().validate(tomorrow)).toBe(true);
    expect(Rules.futureDate().validate(yesterday)).toBe(false);

    expect(Rules.minLength(3).validate('ab')).toBe(false);
    expect(Rules.minLength(3).validate('abc')).toBe(true);
    expect(Rules.maxLength(3).validate('abcd')).toBe(false);
    expect(Rules.maxLength(3).validate('abc')).toBe(true);

    expect(Rules.min(5).validate(4)).toBe(false);
    expect(Rules.min(5).validate(5)).toBe(true);
    expect(Rules.max(5).validate(6)).toBe(false);
    expect(Rules.max(5).validate(5)).toBe(true);

    expect(Rules.pattern(/^[A-Z]+$/, 'caps').validate('abc')).toBe(false);
    expect(Rules.pattern(/^[A-Z]+$/, 'caps').validate('ABC')).toBe(true);

    expect(Rules.matches('confirm').validate('secret', { confirm: 'secret' })).toBe(true);
    expect(Rules.matches('confirm').validate('secret', { confirm: 'nope' })).toBe(false);
  });

  it('validates medical rules', () => {
    expect(MedicalRules.mrn().validate('ABC123')).toBe(true);
    expect(MedicalRules.mrn().validate('123')).toBe(false);

    expect(MedicalRules.icd10().validate('A12')).toBe(true);
    expect(MedicalRules.icd10().validate('A12.3')).toBe(true);
    expect(MedicalRules.icd10().validate('123')).toBe(false);

    expect(MedicalRules.cptCode().validate('12345')).toBe(true);
    expect(MedicalRules.cptCode().validate('1234')).toBe(false);

    expect(MedicalRules.npi().validate('1234567890')).toBe(true);
    expect(MedicalRules.npi().validate('123')).toBe(false);

    expect(MedicalRules.ssn().validate('123-45-6789')).toBe(true);
    expect(MedicalRules.ssn().validate('123456789')).toBe(true);
    expect(MedicalRules.ssn().validate('12')).toBe(false);

    expect(MedicalRules.dosage().validate('2.5ml')).toBe(true);
    expect(MedicalRules.dosage().validate('two')).toBe(false);

    expect(MedicalRules.bloodPressure().validate('120/80')).toBe(true);
    expect(MedicalRules.bloodPressure().validate('30/80')).toBe(false);
    expect(MedicalRules.bloodPressure().validate('120-80')).toBe(false);

    expect(MedicalRules.temperature('F').validate('98.6')).toBe(true);
    expect(MedicalRules.temperature('F').validate('200')).toBe(false);
    expect(MedicalRules.temperature('C').validate('36')).toBe(true);
    expect(MedicalRules.temperature('C').validate('10')).toBe(false);

    expect(MedicalRules.heartRate().validate('60')).toBe(true);
    expect(MedicalRules.heartRate().validate('10')).toBe(false);

    expect(MedicalRules.weight('lbs').validate('150')).toBe(true);
    expect(MedicalRules.weight('lbs').validate('1001')).toBe(false);
    expect(MedicalRules.weight('kg').validate('80')).toBe(true);
    expect(MedicalRules.weight('kg').validate('600')).toBe(false);

    expect(MedicalRules.height().validate("5'10\"")).toBe(true);
    expect(MedicalRules.height().validate('170cm')).toBe(true);
    expect(MedicalRules.height().validate('abc')).toBe(false);
  });
});

describe('validation helpers', () => {
  it('validates fields and forms', async () => {
    const requiredRule = Rules.required('Required');
    const minRule = Rules.minLength(3, 'Too short');

    expect(await validateField('', [requiredRule, minRule])).toBe('Required');
    expect(await validateField('ab', [requiredRule, minRule])).toBe('Too short');
    expect(await validateField('abcd', [requiredRule, minRule])).toBeNull();

    const asyncRule = Rules.custom(async () => false, 'Async failed');
    expect(await validateField('ok', [asyncRule])).toBe('Async failed');

    const errors = await validateForm(
      { name: '', email: 'bad' },
      {
        name: [Rules.required('Name required')],
        email: [Rules.email('Email invalid')],
      }
    );
    expect(errors).toEqual({ name: 'Name required', email: 'Email invalid' });
  });

  it('formats and detects errors', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ name: 'Error' })).toBe(true);

    expect(formatErrorMessage({})).toBe('');
    expect(formatErrorMessage({ name: 'Error' })).toBe('Error');
    expect(formatErrorMessage({ name: 'Error', email: 'Email' })).toBe('Error, Email');
  });
});

describe('useFormValidation', () => {
  it('tracks errors and touched fields', async () => {
    const validations = { name: [Rules.required('Name required')] };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateField('name', '');
    });

    expect(result.current.errors.name).toBe('Name required');
    expect(result.current.getFieldError('name')).toBeUndefined();

    act(() => {
      result.current.touchField('name');
    });

    expect(result.current.getFieldError('name')).toBe('Name required');

    await act(async () => {
      await result.current.validateField('name', 'Avery');
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.hasErrors).toBe(false);
  });

  it('validates full form and resets', async () => {
    const validations = {
      name: [Rules.required('Name required')],
      age: [Rules.min(18, 'Too young')],
    };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateForm({ name: '', age: 10 });
    });

    expect(result.current.errors).toEqual({ name: 'Name required', age: 'Too young' });
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.resetValidation();
    });

    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
  });
});
