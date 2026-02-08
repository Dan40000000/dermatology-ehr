/**
 * PHI Redaction Utilities
 *
 * Utilities to redact Protected Health Information from logs and error reports
 * to ensure HIPAA compliance
 */

import crypto from 'crypto';

/**
 * List of sensitive field names that should be redacted
 */
const PHI_FIELD_NAMES = [
  // Patient identifiers
  'ssn',
  'social_security_number',
  'socialSecurityNumber',
  'mrn',
  'medicalRecordNumber',
  'medical_record_number',

  // Personal information
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'fullName',
  'full_name',
  'patientName',
  'patient_name',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'birthdate',

  // Contact information
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'address',
  'street',
  'streetAddress',
  'street_address',
  'city',
  'zip',
  'zipCode',
  'zip_code',
  'postal_code',
  'postalCode',

  // Medical information
  'diagnosis',
  'diagnosisCode',
  'diagnosis_code',
  'medications',
  'medication',
  'allergies',
  'allergy',
  'conditions',
  'condition',
  'symptoms',
  'symptom',
  'chiefComplaint',
  'chief_complaint',
  'clinicalNotes',
  'clinical_notes',
  'treatmentPlan',
  'treatment_plan',

  // Insurance/Financial
  'insuranceId',
  'insurance_id',
  'policyNumber',
  'policy_number',
  'groupNumber',
  'group_number',
  'subscriberId',
  'subscriber_id',

  // Authentication
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
];

/**
 * Patterns to match and redact in text content
 */
const PHI_PATTERNS = [
  // SSN patterns
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN-REDACTED]' },
  { pattern: /\b\d{9}\b/g, replacement: '[ID-REDACTED]' },

  // Phone numbers
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },
  { pattern: /\+1\s?\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE-REDACTED]' },

  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL-REDACTED]' },

  // Dates (potential DOB)
  { pattern: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, replacement: '[DATE-REDACTED]' },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, replacement: '[DATE-REDACTED]' },

  // ZIP codes (last 4 digits only to maintain general location)
  { pattern: /\b\d{5}-\d{4}\b/g, replacement: (match: string) => match.slice(0, 5) + '-XXXX' },
];

/**
 * Hash a sensitive value for logging (one-way hash)
 */
export function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function redactWithFieldContext(value: any, fieldName: string, depth: number): any {
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => redactWithFieldContext(item, fieldName, depth + 1));
  }

  if (typeof value === 'object') {
    const redacted: any = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = redactWithFieldContext(nestedValue, fieldName, depth + 1);
    }
    return redacted;
  }

  return redactValue(value, fieldName);
}

/**
 * Redact PHI from a single value
 */
export function redactValue(value: any, fieldName?: string): any {
  if (value === null || value === undefined) {
    return value;
  }

  // If this is a known PHI field, redact it
  if (fieldName && isPHIField(fieldName)) {
    const normalizedField = fieldName.toLowerCase();
    if (typeof value === 'string') {
      // For ID fields, provide a hash for correlation
      if (
        normalizedField.includes('id') ||
        normalizedField === 'mrn' ||
        normalizedField === 'ssn' ||
        normalizedField.includes('socialsecurity')
      ) {
        return `[REDACTED-${hashValue(value)}]`;
      }
      if (normalizedField.includes('email')) {
        return '[EMAIL-REDACTED]';
      }
      if (normalizedField.includes('phone')) {
        return '[PHONE-REDACTED]';
      }
      if (normalizedField.includes('date') || normalizedField.includes('birth') || normalizedField === 'dob') {
        return '[DATE-REDACTED]';
      }
      return '[REDACTED]';
    }
    return '[REDACTED]';
  }

  // If value is a string, check for PHI patterns
  if (typeof value === 'string') {
    let redactedValue = value;
    for (const { pattern, replacement } of PHI_PATTERNS) {
      if (typeof replacement === 'function') {
        redactedValue = redactedValue.replace(pattern, replacement);
      } else {
        redactedValue = redactedValue.replace(pattern, replacement);
      }
    }
    return redactedValue;
  }

  return value;
}

/**
 * Recursively redact PHI from an object
 */
export function redactPHI(obj: any, depth: number = 0): any {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactPHI(item, depth + 1));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        redacted[key] = value;
        continue;
      }

      // Check if this field should be redacted
      const lowerKey = key.toLowerCase();

      if (PHI_FIELD_NAMES.some(phi => lowerKey === phi.toLowerCase())) {
        // This is a PHI field - redact with field context
        redacted[key] = redactWithFieldContext(value, key, depth + 1);
      } else if (typeof value === 'object' || Array.isArray(value)) {
        // Recursively redact nested objects
        redacted[key] = redactPHI(value, depth + 1);
      } else {
        // Redact the value (checks for patterns)
        redacted[key] = redactValue(value, key);
      }
    }
    return redacted;
  }

  // For primitive types, just redact patterns
  return redactValue(obj);
}

/**
 * Redact PHI from error messages and stack traces
 */
export function redactError(error: Error): Error {
  const redactedError = new Error(redactValue(error.message));
  redactedError.name = error.name;

  if (error.stack) {
    redactedError.stack = redactValue(error.stack);
  }

  return redactedError;
}

/**
 * Check if a field name indicates PHI
 */
export function isPHIField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return PHI_FIELD_NAMES.some(phi => lowerField === phi.toLowerCase());
}

/**
 * Redact specific fields from an object (for targeted redaction)
 */
export function redactFields(obj: any, fieldsToRedact: string[]): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const redacted: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (fieldsToRedact.includes(key)) {
      if (typeof value === 'string' && key.toLowerCase().includes('id')) {
        redacted[key] = `[REDACTED-${hashValue(value)}]`;
      } else {
        redacted[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactFields(value, fieldsToRedact);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Safe logging wrapper that automatically redacts PHI
 */
export function createSafeLogger(logger: any) {
  return {
    info: (message: string, meta?: any) => {
      logger.info(message, meta ? redactPHI(meta) : undefined);
    },
    warn: (message: string, meta?: any) => {
      logger.warn(message, meta ? redactPHI(meta) : undefined);
    },
    error: (message: string, meta?: any) => {
      const redactedMeta = meta ? redactPHI(meta) : undefined;
      const redactedMessage = redactValue(message);
      logger.error(redactedMessage, redactedMeta);
    },
    debug: (message: string, meta?: any) => {
      logger.debug(message, meta ? redactPHI(meta) : undefined);
    },
  };
}
