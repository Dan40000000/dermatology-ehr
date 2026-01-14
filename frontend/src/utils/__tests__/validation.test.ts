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

describe('Rules - required', () => {
  it('validates required fields', () => {
    const rule = Rules.required();
    expect(rule.validate('')).toBe(false);
    expect(rule.validate('  ')).toBe(false); // Whitespace only
    expect(rule.validate('ok')).toBe(true);
    expect(rule.validate('  text  ')).toBe(true); // Has content after trim
  });

  it('validates required arrays', () => {
    const rule = Rules.required();
    expect(rule.validate([])).toBe(false);
    expect(rule.validate([1])).toBe(true);
    expect(rule.validate([1, 2, 3])).toBe(true);
  });

  it('validates null and undefined', () => {
    const rule = Rules.required();
    expect(rule.validate(null)).toBe(false);
    expect(rule.validate(undefined)).toBe(false);
  });

  it('validates other truthy values', () => {
    const rule = Rules.required();
    expect(rule.validate(0)).toBe(true);
    expect(rule.validate(false)).toBe(true);
    expect(rule.validate({})).toBe(true);
  });

  it('uses custom message', () => {
    const rule = Rules.required('Custom required message');
    expect(rule.message).toBe('Custom required message');
  });
});

describe('Rules - email', () => {
  it('validates correct email formats', () => {
    const rule = Rules.email();
    expect(rule.validate('test@example.com')).toBe(true);
    expect(rule.validate('user.name+tag@example.co.uk')).toBe(true);
    expect(rule.validate('test_123@test-domain.org')).toBe(true);
  });

  it('rejects invalid email formats', () => {
    const rule = Rules.email();
    expect(rule.validate('bad-email')).toBe(false);
    expect(rule.validate('@example.com')).toBe(false);
    expect(rule.validate('test@')).toBe(false);
    expect(rule.validate('test@com')).toBe(false);
    expect(rule.validate('test @example.com')).toBe(false);
  });

  it('allows empty values (handled by required)', () => {
    const rule = Rules.email();
    expect(rule.validate('')).toBe(true);
    expect(rule.validate(null)).toBe(true);
    expect(rule.validate(undefined)).toBe(true);
  });
});

describe('Rules - phone', () => {
  it('validates various phone formats', () => {
    const rule = Rules.phone();
    expect(rule.validate('123-456-7890')).toBe(true);
    expect(rule.validate('(123) 456-7890')).toBe(true);
    expect(rule.validate('1234567890')).toBe(true);
    expect(rule.validate('+1234567890')).toBe(true); // +1 without spaces
    expect(rule.validate('123.456.7890')).toBe(true);
    expect(rule.validate('(123)456-7890')).toBe(true); // No space after parens
  });

  it('rejects invalid phone numbers', () => {
    const rule = Rules.phone();
    expect(rule.validate('not-a-phone')).toBe(false);
    expect(rule.validate('123')).toBe(false);
    expect(rule.validate('abc-def-ghij')).toBe(false);
  });

  it('allows empty values', () => {
    const rule = Rules.phone();
    expect(rule.validate('')).toBe(true);
  });
});

describe('Rules - date', () => {
  it('validates valid dates', () => {
    const rule = Rules.date();
    expect(rule.validate('2020-01-01')).toBe(true);
    expect(rule.validate('2024-12-31')).toBe(true);
    expect(rule.validate(new Date().toISOString())).toBe(true);
  });

  it('rejects invalid dates', () => {
    const rule = Rules.date();
    expect(rule.validate('bad-date')).toBe(false);
    expect(rule.validate('2024-13-01')).toBe(false); // Invalid month
    expect(rule.validate('not a date')).toBe(false);
  });

  it('allows empty values', () => {
    const rule = Rules.date();
    expect(rule.validate('')).toBe(true);
  });
});

describe('Rules - pastDate and futureDate', () => {
  it('validates past dates', () => {
    const rule = Rules.pastDate();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    expect(rule.validate(yesterday)).toBe(true);
    expect(rule.validate(tomorrow)).toBe(false);
    expect(rule.validate('2000-01-01')).toBe(true);
  });

  it('validates future dates', () => {
    const rule = Rules.futureDate();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    expect(rule.validate(tomorrow)).toBe(true);
    expect(rule.validate(yesterday)).toBe(false);
    expect(rule.validate('2100-01-01')).toBe(true);
  });

  it('allows empty values', () => {
    expect(Rules.pastDate().validate('')).toBe(true);
    expect(Rules.futureDate().validate('')).toBe(true);
  });
});

describe('Rules - minLength and maxLength', () => {
  it('validates minimum length', () => {
    const rule = Rules.minLength(3);
    expect(rule.validate('ab')).toBe(false);
    expect(rule.validate('abc')).toBe(true);
    expect(rule.validate('abcd')).toBe(true);
  });

  it('validates maximum length', () => {
    const rule = Rules.maxLength(3);
    expect(rule.validate('abcd')).toBe(false);
    expect(rule.validate('abc')).toBe(true);
    expect(rule.validate('ab')).toBe(true);
  });

  it('allows empty values', () => {
    expect(Rules.minLength(3).validate('')).toBe(true);
    expect(Rules.maxLength(3).validate('')).toBe(true);
  });

  it('uses custom messages', () => {
    expect(Rules.minLength(5, 'Too short!').message).toBe('Too short!');
    expect(Rules.maxLength(10, 'Too long!').message).toBe('Too long!');
  });

  it('generates default messages', () => {
    expect(Rules.minLength(5).message).toBe('Must be at least 5 characters');
    expect(Rules.maxLength(10).message).toBe('Must be no more than 10 characters');
  });
});

describe('Rules - min and max', () => {
  it('validates minimum value', () => {
    const rule = Rules.min(5);
    expect(rule.validate(4)).toBe(false);
    expect(rule.validate(5)).toBe(true);
    expect(rule.validate(6)).toBe(true);
    expect(rule.validate('10')).toBe(true); // String numbers
  });

  it('validates maximum value', () => {
    const rule = Rules.max(5);
    expect(rule.validate(6)).toBe(false);
    expect(rule.validate(5)).toBe(true);
    expect(rule.validate(4)).toBe(true);
    expect(rule.validate('3')).toBe(true); // String numbers
  });

  it('allows empty values', () => {
    expect(Rules.min(5).validate('')).toBe(true);
    expect(Rules.min(5).validate(null)).toBe(true);
    expect(Rules.min(5).validate(undefined)).toBe(true);
    expect(Rules.max(5).validate('')).toBe(true);
  });

  it('uses custom messages', () => {
    expect(Rules.min(18, 'Must be adult').message).toBe('Must be adult');
    expect(Rules.max(100, 'Too high').message).toBe('Too high');
  });
});

describe('Rules - pattern', () => {
  it('validates regex patterns', () => {
    const rule = Rules.pattern(/^[A-Z]+$/, 'Must be uppercase');
    expect(rule.validate('abc')).toBe(false);
    expect(rule.validate('ABC')).toBe(true);
    expect(rule.validate('AbC')).toBe(false);
  });

  it('validates complex patterns', () => {
    const zipCode = Rules.pattern(/^\d{5}(-\d{4})?$/, 'Invalid ZIP');
    expect(zipCode.validate('12345')).toBe(true);
    expect(zipCode.validate('12345-6789')).toBe(true);
    expect(zipCode.validate('1234')).toBe(false);
  });

  it('allows empty values', () => {
    const rule = Rules.pattern(/^[A-Z]+$/, 'caps');
    expect(rule.validate('')).toBe(true);
  });
});

describe('Rules - matches', () => {
  it('validates matching fields', () => {
    const rule = Rules.matches('confirm');
    expect(rule.validate('secret', { confirm: 'secret' })).toBe(true);
    expect(rule.validate('secret', { confirm: 'nope' })).toBe(false);
  });

  it('allows empty values and missing form data', () => {
    const rule = Rules.matches('confirm');
    expect(rule.validate('', { confirm: '' })).toBe(true);
    expect(rule.validate('secret', undefined)).toBe(true);
  });

  it('uses custom message', () => {
    const rule = Rules.matches('password', 'Passwords do not match');
    expect(rule.message).toBe('Passwords do not match');
  });
});

describe('Rules - custom', () => {
  it('validates with custom sync function', () => {
    const rule = Rules.custom((value) => value === 'special', 'Must be special');
    expect(rule.validate('special')).toBe(true);
    expect(rule.validate('other')).toBe(false);
  });

  it('validates with custom async function', async () => {
    const rule = Rules.custom(
      async (value) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return value === 'async';
      },
      'Async validation failed'
    );

    expect(await rule.validate('async')).toBe(true);
    expect(await rule.validate('other')).toBe(false);
  });

  it('receives form data', () => {
    const rule = Rules.custom(
      (value, formData) => formData?.enabled === true,
      'Requires enabled flag'
    );
    expect(rule.validate('test', { enabled: true })).toBe(true);
    expect(rule.validate('test', { enabled: false })).toBe(false);
  });
});

describe('MedicalRules - mrn', () => {
  it('validates medical record numbers', () => {
    const rule = MedicalRules.mrn();
    expect(rule.validate('ABC123')).toBe(true);
    expect(rule.validate('123456')).toBe(true);
    expect(rule.validate('ABCD1234')).toBe(true);
  });

  it('rejects invalid MRNs', () => {
    const rule = MedicalRules.mrn();
    expect(rule.validate('123')).toBe(false); // Too short
    expect(rule.validate('12345678901')).toBe(false); // Too long
    expect(rule.validate('AB-123')).toBe(false); // Special chars
  });

  it('allows empty values', () => {
    expect(MedicalRules.mrn().validate('')).toBe(true);
  });
});

describe('MedicalRules - icd10', () => {
  it('validates ICD-10 codes', () => {
    const rule = MedicalRules.icd10();
    expect(rule.validate('A12')).toBe(true);
    expect(rule.validate('A12.3')).toBe(true);
    expect(rule.validate('Z99.89')).toBe(true);
    expect(rule.validate('M54.5')).toBe(true);
  });

  it('rejects invalid ICD-10 codes', () => {
    const rule = MedicalRules.icd10();
    expect(rule.validate('123')).toBe(false); // Must start with letter
    expect(rule.validate('AB12')).toBe(false); // Two letters
    expect(rule.validate('A1')).toBe(false); // Too short
  });
});

describe('MedicalRules - cptCode', () => {
  it('validates CPT codes', () => {
    const rule = MedicalRules.cptCode();
    expect(rule.validate('12345')).toBe(true);
    expect(rule.validate('99213')).toBe(true);
  });

  it('rejects invalid CPT codes', () => {
    const rule = MedicalRules.cptCode();
    expect(rule.validate('1234')).toBe(false); // Too short
    expect(rule.validate('123456')).toBe(false); // Too long
    expect(rule.validate('ABCDE')).toBe(false); // Not numbers
  });
});

describe('MedicalRules - npi', () => {
  it('validates NPI numbers', () => {
    const rule = MedicalRules.npi();
    expect(rule.validate('1234567890')).toBe(true);
    expect(rule.validate('9876543210')).toBe(true);
  });

  it('rejects invalid NPI numbers', () => {
    const rule = MedicalRules.npi();
    expect(rule.validate('123')).toBe(false); // Too short
    expect(rule.validate('12345678901')).toBe(false); // Too long
  });
});

describe('MedicalRules - ssn', () => {
  it('validates SSN formats', () => {
    const rule = MedicalRules.ssn();
    expect(rule.validate('123-45-6789')).toBe(true);
    expect(rule.validate('123456789')).toBe(true);
  });

  it('rejects invalid SSN', () => {
    const rule = MedicalRules.ssn();
    expect(rule.validate('12')).toBe(false);
    expect(rule.validate('123-45-678')).toBe(false);
  });
});

describe('MedicalRules - dosage', () => {
  it('validates dosage formats', () => {
    const rule = MedicalRules.dosage();
    expect(rule.validate('2.5ml')).toBe(true);
    expect(rule.validate('10mg')).toBe(true);
    expect(rule.validate('1 tablet')).toBe(true);
    expect(rule.validate('5mcg')).toBe(true);
    expect(rule.validate('100mg')).toBe(true);
  });

  it('rejects invalid dosage', () => {
    const rule = MedicalRules.dosage();
    expect(rule.validate('two')).toBe(false);
    expect(rule.validate('mg10')).toBe(false);
  });
});

describe('MedicalRules - bloodPressure', () => {
  it('validates blood pressure', () => {
    const rule = MedicalRules.bloodPressure();
    expect(rule.validate('120/80')).toBe(true);
    expect(rule.validate('90/60')).toBe(true);
    expect(rule.validate('140/90')).toBe(true);
  });

  it('rejects invalid blood pressure', () => {
    const rule = MedicalRules.bloodPressure();
    expect(rule.validate('30/80')).toBe(false); // Systolic too low
    expect(rule.validate('120/20')).toBe(false); // Diastolic too low
    expect(rule.validate('300/80')).toBe(false); // Systolic too high
    expect(rule.validate('120/200')).toBe(false); // Diastolic too high
    expect(rule.validate('120-80')).toBe(false); // Wrong format
  });
});

describe('MedicalRules - temperature', () => {
  it('validates Fahrenheit temperatures', () => {
    const rule = MedicalRules.temperature('F');
    expect(rule.validate('98.6')).toBe(true);
    expect(rule.validate('99.5')).toBe(true);
    expect(rule.validate('95')).toBe(true);
    expect(rule.validate('107')).toBe(true);
  });

  it('rejects invalid Fahrenheit temperatures', () => {
    const rule = MedicalRules.temperature('F');
    expect(rule.validate('200')).toBe(false);
    expect(rule.validate('50')).toBe(false);
  });

  it('validates Celsius temperatures', () => {
    const rule = MedicalRules.temperature('C');
    expect(rule.validate('36')).toBe(true);
    expect(rule.validate('37.5')).toBe(true);
    expect(rule.validate('35')).toBe(true);
    expect(rule.validate('42')).toBe(true);
  });

  it('rejects invalid Celsius temperatures', () => {
    const rule = MedicalRules.temperature('C');
    expect(rule.validate('10')).toBe(false);
    expect(rule.validate('50')).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(MedicalRules.temperature('F').validate('hot')).toBe(false);
    expect(MedicalRules.temperature('C').validate('cold')).toBe(false);
  });
});

describe('MedicalRules - heartRate', () => {
  it('validates heart rate', () => {
    const rule = MedicalRules.heartRate();
    expect(rule.validate('60')).toBe(true);
    expect(rule.validate('80')).toBe(true);
    expect(rule.validate('40')).toBe(true);
    expect(rule.validate('200')).toBe(true);
  });

  it('rejects invalid heart rate', () => {
    const rule = MedicalRules.heartRate();
    expect(rule.validate('10')).toBe(false);
    expect(rule.validate('250')).toBe(false);
    expect(rule.validate('abc')).toBe(false);
  });
});

describe('MedicalRules - weight', () => {
  it('validates weight in pounds', () => {
    const rule = MedicalRules.weight('lbs');
    expect(rule.validate('150')).toBe(true);
    expect(rule.validate('2')).toBe(true);
    expect(rule.validate('1000')).toBe(true);
  });

  it('rejects invalid weight in pounds', () => {
    const rule = MedicalRules.weight('lbs');
    expect(rule.validate('1001')).toBe(false);
    expect(rule.validate('1')).toBe(false);
  });

  it('validates weight in kilograms', () => {
    const rule = MedicalRules.weight('kg');
    expect(rule.validate('80')).toBe(true);
    expect(rule.validate('1')).toBe(true);
    expect(rule.validate('500')).toBe(true);
  });

  it('rejects invalid weight in kilograms', () => {
    const rule = MedicalRules.weight('kg');
    expect(rule.validate('600')).toBe(false);
    expect(rule.validate('0.5')).toBe(false);
  });
});

describe('MedicalRules - height', () => {
  it('validates height formats', () => {
    const rule = MedicalRules.height();
    expect(rule.validate("5'10\"")).toBe(true);
    expect(rule.validate("5'10")).toBe(true);
    expect(rule.validate("6'2\"")).toBe(true);
    expect(rule.validate('170cm')).toBe(true);
    expect(rule.validate('170')).toBe(true);
  });

  it('rejects invalid height', () => {
    const rule = MedicalRules.height();
    expect(rule.validate('abc')).toBe(false);
    expect(rule.validate("5'\"")).toBe(false);
  });
});

describe('validation helpers', () => {
  it('validates single field with multiple rules', async () => {
    const requiredRule = Rules.required('Required');
    const minRule = Rules.minLength(3, 'Too short');

    expect(await validateField('', [requiredRule, minRule])).toBe('Required');
    expect(await validateField('ab', [requiredRule, minRule])).toBe('Too short');
    expect(await validateField('abcd', [requiredRule, minRule])).toBeNull();
  });

  it('validates field with async rules', async () => {
    const asyncRule = Rules.custom(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return false;
    }, 'Async failed');

    expect(await validateField('ok', [asyncRule])).toBe('Async failed');
  });

  it('stops at first validation error', async () => {
    const rule1 = Rules.required('Required');
    const rule2 = Rules.minLength(5, 'Too short');
    const rule3 = Rules.pattern(/^\d+$/, 'Must be numeric');

    // Should return first error
    expect(await validateField('', [rule1, rule2, rule3])).toBe('Required');
    expect(await validateField('abc', [rule1, rule2, rule3])).toBe('Too short');
  });

  it('validates entire form', async () => {
    const errors = await validateForm(
      { name: '', email: 'bad', age: 15 },
      {
        name: [Rules.required('Name required')],
        email: [Rules.email('Email invalid')],
        age: [Rules.min(18, 'Must be 18+')],
      }
    );

    expect(errors).toEqual({
      name: 'Name required',
      email: 'Email invalid',
      age: 'Must be 18+',
    });
  });

  it('returns empty errors for valid form', async () => {
    const errors = await validateForm(
      { name: 'John', email: 'john@example.com' },
      {
        name: [Rules.required('Name required')],
        email: [Rules.email('Email invalid')],
      }
    );

    expect(errors).toEqual({});
  });
});

describe('hasErrors and formatErrorMessage', () => {
  it('detects errors', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ name: 'Error' })).toBe(true);
    expect(hasErrors({ name: 'Error', email: 'Error' })).toBe(true);
  });

  it('formats single error', () => {
    expect(formatErrorMessage({})).toBe('');
    expect(formatErrorMessage({ name: 'Name is required' })).toBe('Name is required');
  });

  it('formats multiple errors', () => {
    const errors = {
      name: 'Name is required',
      email: 'Email is invalid',
      age: 'Must be 18+',
    };
    expect(formatErrorMessage(errors)).toBe('Name is required, Email is invalid, Must be 18+');
  });
});

describe('useFormValidation hook', () => {
  it('tracks errors and touched fields', async () => {
    const validations = { name: [Rules.required('Name required')] };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateField('name', '');
    });

    expect(result.current.errors.name).toBe('Name required');
    expect(result.current.getFieldError('name')).toBeUndefined(); // Not touched yet

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

  it('validates full form and returns errors', async () => {
    const validations = {
      name: [Rules.required('Name required')],
      age: [Rules.min(18, 'Too young')],
    };
    const { result } = renderHook(() => useFormValidation(validations));

    let returnedErrors;
    await act(async () => {
      returnedErrors = await result.current.validateForm({ name: '', age: 10 });
    });

    expect(returnedErrors).toEqual({ name: 'Name required', age: 'Too young' });
    expect(result.current.errors).toEqual({ name: 'Name required', age: 'Too young' });
    expect(result.current.hasErrors).toBe(true);
  });

  it('resets validation state', async () => {
    const validations = {
      name: [Rules.required('Name required')],
      age: [Rules.min(18, 'Too young')],
    };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateForm({ name: '', age: 10 });
    });

    act(() => {
      result.current.touchField('name');
      result.current.touchField('age');
    });

    expect(result.current.errors).toEqual({ name: 'Name required', age: 'Too young' });
    expect(result.current.touched).toEqual({ name: true, age: true });

    act(() => {
      result.current.resetValidation();
    });

    expect(result.current.errors).toEqual({});
    expect(result.current.touched).toEqual({});
    expect(result.current.hasErrors).toBe(false);
  });

  it('validates individual field with form context', async () => {
    const validations = {
      password: [Rules.required('Password required')],
      confirmPassword: [Rules.matches('password', 'Passwords must match')],
    };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateField('confirmPassword', 'secret', { password: 'secret' });
    });

    expect(result.current.errors.confirmPassword).toBeUndefined();

    await act(async () => {
      await result.current.validateField('confirmPassword', 'different', { password: 'secret' });
    });

    expect(result.current.errors.confirmPassword).toBe('Passwords must match');
  });

  it('clears field error when validation passes', async () => {
    const validations = { name: [Rules.required('Name required')] };
    const { result } = renderHook(() => useFormValidation(validations));

    await act(async () => {
      await result.current.validateField('name', '');
    });

    expect(result.current.errors.name).toBe('Name required');

    await act(async () => {
      await result.current.validateField('name', 'Valid Name');
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.hasErrors).toBe(false);
  });
});
