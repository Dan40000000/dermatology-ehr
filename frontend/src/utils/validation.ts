/**
 * Form Validation Utilities
 * Client-side validation for medical and general forms
 */

export interface ValidationRule {
  validate: (value: any, formData?: any) => boolean | Promise<boolean>;
  message: string;
}

export interface FieldValidation {
  [fieldName: string]: ValidationRule[];
}

export interface ValidationErrors {
  [fieldName: string]: string;
}

/**
 * Common validation rules
 */
export const Rules = {
  required: (message = 'This field is required'): ValidationRule => ({
    validate: (value) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    },
    message,
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Let required rule handle empty values
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // Accept formats: (123) 456-7890, 123-456-7890, 1234567890, +1 123-456-7890
      const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
      return phoneRegex.test(value.replace(/\s/g, ''));
    },
    message,
  }),

  date: (message = 'Please enter a valid date'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const date = new Date(value);
      return date instanceof Date && !isNaN(date.getTime());
    },
    message,
  }),

  pastDate: (message = 'Date must be in the past'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const date = new Date(value);
      return date < new Date();
    },
    message,
  }),

  futureDate: (message = 'Date must be in the future'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const date = new Date(value);
      return date > new Date();
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return value.length >= min;
    },
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return value.length <= max;
    },
    message: message || `Must be no more than ${max} characters`,
  }),

  min: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (value === null || value === undefined || value === '') return true;
      return Number(value) >= min;
    },
    message: message || `Must be at least ${min}`,
  }),

  max: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (value === null || value === undefined || value === '') return true;
      return Number(value) <= max;
    },
    message: message || `Must be no more than ${max}`,
  }),

  pattern: (regex: RegExp, message: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return regex.test(value);
    },
    message,
  }),

  matches: (fieldName: string, message = 'Fields do not match'): ValidationRule => ({
    validate: (value, formData) => {
      if (!value || !formData) return true;
      return value === formData[fieldName];
    },
    message,
  }),

  custom: (validator: (value: any, formData?: any) => boolean | Promise<boolean>, message: string): ValidationRule => ({
    validate: validator,
    message,
  }),
};

/**
 * Medical-specific validation rules
 */
export const MedicalRules = {
  mrn: (message = 'Please enter a valid medical record number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // MRN typically 6-10 alphanumeric characters
      const mrnRegex = /^[A-Z0-9]{6,10}$/i;
      return mrnRegex.test(value);
    },
    message,
  }),

  icd10: (message = 'Please enter a valid ICD-10 code'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // ICD-10 format: Letter + 2 digits + optional decimal + up to 4 more characters
      const icd10Regex = /^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$/i;
      return icd10Regex.test(value);
    },
    message,
  }),

  cptCode: (message = 'Please enter a valid CPT code'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // CPT codes are 5 digits
      const cptRegex = /^[0-9]{5}$/;
      return cptRegex.test(value);
    },
    message,
  }),

  npi: (message = 'Please enter a valid NPI number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // NPI is exactly 10 digits
      const npiRegex = /^[0-9]{10}$/;
      return npiRegex.test(value);
    },
    message,
  }),

  ssn: (message = 'Please enter a valid SSN'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // Accept formats: 123-45-6789 or 123456789
      const ssnRegex = /^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$/;
      return ssnRegex.test(value);
    },
    message,
  }),

  dosage: (message = 'Please enter a valid dosage'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // Format: number + optional unit (e.g., "10mg", "2.5ml", "1 tablet")
      const dosageRegex = /^[0-9]+(\.[0-9]+)?\s*(mg|g|ml|mcg|unit|tablet|capsule|drop|spray|patch|injection)?$/i;
      return dosageRegex.test(value);
    },
    message,
  }),

  bloodPressure: (message = 'Please enter valid blood pressure (e.g., 120/80)'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const bpRegex = /^[0-9]{2,3}\/[0-9]{2,3}$/;
      if (!bpRegex.test(value)) return false;

      const [systolic, diastolic] = value.split('/').map(Number);
      // Reasonable ranges: systolic 70-250, diastolic 40-150
      return systolic >= 70 && systolic <= 250 && diastolic >= 40 && diastolic <= 150;
    },
    message,
  }),

  temperature: (unit: 'F' | 'C' = 'F', message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const temp = Number(value);
      if (isNaN(temp)) return false;

      if (unit === 'F') {
        // Fahrenheit: reasonable range 95-107°F
        return temp >= 95 && temp <= 107;
      } else {
        // Celsius: reasonable range 35-42°C
        return temp >= 35 && temp <= 42;
      }
    },
    message: message || `Please enter a valid temperature in ${unit === 'F' ? 'Fahrenheit (95-107)' : 'Celsius (35-42)'}`,
  }),

  heartRate: (message = 'Please enter a valid heart rate (40-200 bpm)'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const hr = Number(value);
      return !isNaN(hr) && hr >= 40 && hr <= 200;
    },
    message,
  }),

  weight: (unit: 'lbs' | 'kg' = 'lbs', message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const weight = Number(value);
      if (isNaN(weight)) return false;

      if (unit === 'lbs') {
        // Reasonable range: 2-1000 lbs
        return weight >= 2 && weight <= 1000;
      } else {
        // Reasonable range: 1-500 kg
        return weight >= 1 && weight <= 500;
      }
    },
    message: message || `Please enter a valid weight in ${unit}`,
  }),

  height: (message = 'Please enter a valid height (e.g., 5\'10" or 170cm)'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      // Accept formats: 5'10", 5'10, 170cm, 170
      const heightRegex = /^([0-9]'[0-9]{1,2}"?|[0-9]{2,3}(cm)?)$/i;
      return heightRegex.test(value.replace(/\s/g, ''));
    },
    message,
  }),
};

/**
 * Validate a single field
 */
export async function validateField(
  value: any,
  rules: ValidationRule[],
  formData?: any
): Promise<string | null> {
  for (const rule of rules) {
    const isValid = await rule.validate(value, formData);
    if (!isValid) {
      return rule.message;
    }
  }
  return null;
}

/**
 * Validate entire form
 */
export async function validateForm(
  formData: Record<string, any>,
  validations: FieldValidation
): Promise<ValidationErrors> {
  const errors: ValidationErrors = {};

  for (const [fieldName, rules] of Object.entries(validations)) {
    const value = formData[fieldName];
    const error = await validateField(value, rules, formData);
    if (error) {
      errors[fieldName] = error;
    }
  }

  return errors;
}

/**
 * Check if form has any errors
 */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Format error messages for display
 */
export function formatErrorMessage(errors: ValidationErrors): string {
  const messages = Object.values(errors);
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0];
  return messages.join(', ');
}

/**
 * React hook for form validation
 */
export function useFormValidation(validations: FieldValidation) {
  const [errors, setErrors] = React.useState<ValidationErrors>({});
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});

  const runFieldValidation = async (fieldName: string, value: any, formData?: any) => {
    const rules = validations[fieldName];
    if (!rules) return;

    const error = await validateField(value, rules, formData);
    setErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[fieldName] = error;
      } else {
        delete next[fieldName];
      }
      return next;
    });
  };

  const runFormValidation = async (formData: Record<string, any>) => {
    const newErrors = await validateForm(formData, validations);
    setErrors(newErrors);
    return newErrors;
  };

  const touchField = (fieldName: string) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
  };

  const resetValidation = () => {
    setErrors({});
    setTouched({});
  };

  const getFieldError = (fieldName: string): string | undefined => {
    return touched[fieldName] ? errors[fieldName] : undefined;
  };

  return {
    errors,
    touched,
    validateField: runFieldValidation,
    validateForm: runFormValidation,
    touchField,
    resetValidation,
    getFieldError,
    hasErrors: hasErrors(errors),
  };
}

// Import React for the hook
import React from 'react';
