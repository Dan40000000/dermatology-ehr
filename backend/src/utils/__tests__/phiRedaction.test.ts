/**
 * PHI Redaction Tests
 *
 * Test suite for PHI redaction utilities
 */

import {
  redactPHI,
  redactValue,
  hashValue,
  isPHIField,
  redactFields,
  redactError,
} from '../phiRedaction';

describe('PHI Redaction', () => {
  describe('redactValue', () => {
    it('should redact email addresses', () => {
      const text = 'Contact john.doe@example.com for info';
      const redacted = redactValue(text);
      expect(redacted).toBe('Contact [EMAIL-REDACTED] for info');
    });

    it('should redact phone numbers', () => {
      const text = 'Call 555-123-4567 or 555.987.6543';
      const redacted = redactValue(text);
      expect(redacted).toContain('[PHONE-REDACTED]');
    });

    it('should redact SSN patterns', () => {
      const text = 'SSN: 123-45-6789';
      const redacted = redactValue(text);
      expect(redacted).toBe('SSN: [SSN-REDACTED]');
    });

    it('should redact dates', () => {
      const text = 'DOB: 01/15/1990';
      const redacted = redactValue(text);
      expect(redacted).toBe('DOB: [DATE-REDACTED]');
    });

    it('should redact known PHI fields', () => {
      const value = redactValue('John Doe', 'firstName');
      expect(value).toBe('[REDACTED]');
    });

    it('should hash ID fields for correlation', () => {
      const ssn = '123-45-6789';
      const redacted1 = redactValue(ssn, 'ssn');
      const redacted2 = redactValue(ssn, 'ssn');

      expect(redacted1).toMatch(/\[REDACTED-[a-f0-9]+\]/);
      expect(redacted1).toBe(redacted2); // Same value produces same hash
    });
  });

  describe('redactPHI', () => {
    it('should redact patient information', () => {
      const patient = {
        id: 'patient-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        ssn: '123-45-6789',
        dateOfBirth: '1990-01-15',
      };

      const redacted = redactPHI(patient);

      expect(redacted.firstName).toBe('[REDACTED]');
      expect(redacted.lastName).toBe('[REDACTED]');
      expect(redacted.email).toBe('[EMAIL-REDACTED]');
      expect(redacted.phone).toBe('[PHONE-REDACTED]');
      expect(redacted.ssn).toMatch(/\[REDACTED-[a-f0-9]+\]/);
      expect(redacted.dateOfBirth).toBe('[DATE-REDACTED]');
    });

    it('should redact nested objects', () => {
      const data = {
        patient: {
          firstName: 'John',
          lastName: 'Doe',
          contact: {
            email: 'john@example.com',
            phone: '555-123-4567',
          },
        },
      };

      const redacted = redactPHI(data);

      expect(redacted.patient.firstName).toBe('[REDACTED]');
      expect(redacted.patient.lastName).toBe('[REDACTED]');
      expect(redacted.patient.contact.email).toBe('[EMAIL-REDACTED]');
      expect(redacted.patient.contact.phone).toBe('[PHONE-REDACTED]');
    });

    it('should redact arrays', () => {
      const data = {
        patients: [
          { firstName: 'John', lastName: 'Doe' },
          { firstName: 'Jane', lastName: 'Smith' },
        ],
      };

      const redacted = redactPHI(data);

      expect(redacted.patients[0].firstName).toBe('[REDACTED]');
      expect(redacted.patients[0].lastName).toBe('[REDACTED]');
      expect(redacted.patients[1].firstName).toBe('[REDACTED]');
      expect(redacted.patients[1].lastName).toBe('[REDACTED]');
    });

    it('should handle null and undefined values', () => {
      const data = {
        firstName: null,
        lastName: undefined,
        email: 'test@example.com',
      };

      const redacted = redactPHI(data);

      expect(redacted.firstName).toBeNull();
      expect(redacted.lastName).toBeUndefined();
      expect(redacted.email).toBe('[EMAIL-REDACTED]');
    });

    it('should redact PHI fields regardless of key casing', () => {
      const data = {
        FirstName: 'John',
        EMAIL: 'john@example.com',
        Phone: '555-123-4567',
      };

      const redacted = redactPHI(data);

      expect(redacted.FirstName).toBe('[REDACTED]');
      expect(redacted.EMAIL).toBe('[EMAIL-REDACTED]');
      expect(redacted.Phone).toBe('[PHONE-REDACTED]');
    });

    it('should prevent infinite recursion', () => {
      const circular: any = { firstName: 'John' };
      circular.self = circular;

      // Should not throw stack overflow
      expect(() => redactPHI(circular)).not.toThrow();
    });
  });

  describe('hashValue', () => {
    it('should produce consistent hashes', () => {
      const value = 'test-value-123';
      const hash1 = hashValue(value);
      const hash2 = hashValue(value);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should produce different hashes for different values', () => {
      const hash1 = hashValue('value1');
      const hash2 = hashValue('value2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce short hashes for correlation', () => {
      const hash = hashValue('123-45-6789');
      expect(hash).toHaveLength(16); // Truncated SHA-256
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('isPHIField', () => {
    it('should identify PHI field names', () => {
      expect(isPHIField('firstName')).toBe(true);
      expect(isPHIField('lastName')).toBe(true);
      expect(isPHIField('email')).toBe(true);
      expect(isPHIField('ssn')).toBe(true);
      expect(isPHIField('dateOfBirth')).toBe(true);
      expect(isPHIField('phone')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isPHIField('FIRSTNAME')).toBe(true);
      expect(isPHIField('FirstName')).toBe(true);
      expect(isPHIField('firstname')).toBe(true);
    });

    it('should not identify non-PHI fields', () => {
      expect(isPHIField('id')).toBe(false);
      expect(isPHIField('tenantId')).toBe(false);
      expect(isPHIField('createdAt')).toBe(false);
      expect(isPHIField('updatedAt')).toBe(false);
    });
  });

  describe('redactFields', () => {
    it('should redact only specified fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        id: 'patient-123',
        tenantId: 'tenant-456',
      };

      const redacted = redactFields(data, ['firstName', 'lastName']);

      expect(redacted.firstName).toBe('[REDACTED]');
      expect(redacted.lastName).toBe('[REDACTED]');
      expect(redacted.id).toBe('patient-123'); // Not redacted
      expect(redacted.tenantId).toBe('tenant-456'); // Not redacted
    });

    it('should handle nested objects', () => {
      const data = {
        patient: {
          firstName: 'John',
          id: 'patient-123',
        },
      };

      const redacted = redactFields(data, ['firstName']);

      expect(redacted.patient.firstName).toBe('[REDACTED]');
      expect(redacted.patient.id).toBe('patient-123');
    });
  });

  describe('redactError', () => {
    it('should redact error messages', () => {
      const error = new Error('Patient john@example.com not found');
      const redacted = redactError(error);

      expect(redacted.message).toBe('Patient [EMAIL-REDACTED] not found');
    });

    it('should redact stack traces', () => {
      const error = new Error('Failed');
      error.stack = 'Error: Failed\n  at processPatient (john@example.com)';

      const redacted = redactError(error);

      expect(redacted.stack).toContain('[EMAIL-REDACTED]');
    });

    it('should preserve error name', () => {
      const error = new Error('Test error');
      error.name = 'CustomError';

      const redacted = redactError(error);

      expect(redacted.name).toBe('CustomError');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle audit log metadata', () => {
      const auditMeta = {
        userId: 'user-123',
        patientId: 'patient-456',
        changes: {
          firstName: { old: 'John', new: 'Jonathan' },
          email: { old: 'john@old.com', new: 'john@new.com' },
        },
        ipAddress: '192.168.1.1',
      };

      const redacted = redactPHI(auditMeta);

      expect(redacted.userId).toBe('user-123'); // Not PHI
      expect(redacted.patientId).toBe('patient-456'); // Not PHI
      expect(redacted.changes.firstName.old).toBe('[REDACTED]');
      expect(redacted.changes.firstName.new).toBe('[REDACTED]');
      expect(redacted.changes.email.old).toBe('[EMAIL-REDACTED]');
      expect(redacted.changes.email.new).toBe('[EMAIL-REDACTED]');
      expect(redacted.ipAddress).toBe('192.168.1.1'); // Not PHI
    });

    it('should handle error context for Sentry', () => {
      const context = {
        operation: 'patient_update',
        patientData: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        metadata: {
          userId: 'user-123',
          timestamp: '2025-12-30T12:00:00Z',
        },
      };

      const redacted = redactPHI(context);

      expect(redacted.operation).toBe('patient_update');
      expect(redacted.patientData.firstName).toBe('[REDACTED]');
      expect(redacted.patientData.lastName).toBe('[REDACTED]');
      expect(redacted.patientData.email).toBe('[EMAIL-REDACTED]');
      expect(redacted.metadata.userId).toBe('user-123');
      expect(redacted.metadata.timestamp).toBe('2025-12-30T12:00:00Z');
    });

    it('should handle log messages with embedded PHI', () => {
      const logMessage = {
        message: 'Patient John Doe (john@example.com) accessed by user-123',
        meta: {
          patientPhone: '555-123-4567',
          action: 'view',
        },
      };

      const redacted = redactPHI(logMessage);

      expect(redacted.message).toContain('[EMAIL-REDACTED]');
      expect(redacted.meta.patientPhone).toBe('[PHONE-REDACTED]');
      expect(redacted.meta.action).toBe('view');
    });

    it('should maintain referential integrity with hashing', () => {
      const data1 = { ssn: '123-45-6789' };
      const data2 = { ssn: '123-45-6789' };
      const data3 = { ssn: '987-65-4321' };

      const redacted1 = redactPHI(data1);
      const redacted2 = redactPHI(data2);
      const redacted3 = redactPHI(data3);

      // Same SSN should produce same hash
      expect(redacted1.ssn).toBe(redacted2.ssn);
      // Different SSN should produce different hash
      expect(redacted1.ssn).not.toBe(redacted3.ssn);
    });
  });
});
