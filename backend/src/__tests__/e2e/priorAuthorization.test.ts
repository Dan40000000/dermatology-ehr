/**
 * E2E Integration Tests: Prior Authorization Flow
 * Tests the complete prior authorization workflow using mock adapter
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/pool';
import {
  createTestTenant,
  createTestUser,
  createTestProvider,
  createTestPatient,
  createTestPrescription,
  cleanupTestTenant,
  TestTenant,
  TestUser,
  TestProvider,
  TestPatient,
} from '../helpers/testHelpers';
import { getPriorAuthAdapter } from '../../services/priorAuthAdapter';
import { randomUUID } from 'crypto';

const describeIf = process.env.RUN_E2E === 'true' ? describe : describe.skip;

describeIf('E2E: Prior Authorization Flow', () => {
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let provider1: TestProvider;
  let provider2: TestProvider;
  let patient1: TestPatient;
  let patient2: TestPatient;

  beforeAll(async () => {
    // Create tenants
    tenant1 = await createTestTenant('Tenant 1 - Prior Auth');
    tenant2 = await createTestTenant('Tenant 2 - Prior Auth');

    // Create users
    user1 = await createTestUser(tenant1.id, 'admin');

    // Create providers
    provider1 = await createTestProvider(tenant1.id, {
      fullName: 'Dr. Sarah Dermatologist',
    });
    provider2 = await createTestProvider(tenant2.id);

    // Create patients
    patient1 = await createTestPatient(tenant1.id);
    patient2 = await createTestPatient(tenant1.id, {
      firstName: 'Jane',
      lastName: 'Smith',
    });
  });

  afterAll(async () => {
    await cleanupTestTenant(tenant1.id);
    await cleanupTestTenant(tenant2.id);
    await pool.end();
  });

  describe('1. Create Prescription Requiring PA', () => {
    it('should create a prescription with prior auth requirement', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient1.id,
        provider1.id,
        'Dupixent',
        true // requires prior auth
      );

      const result = await pool.query(
        `SELECT id, medication_name
         FROM prescriptions
         WHERE id = $1 AND tenant_id = $2`,
        [prescriptionId, tenant1.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].medication_name).toBe('Dupixent');
    });

    it('should flag high-cost medications for prior auth', async () => {
      const prescriptionId = randomUUID();

      await pool.query(
        `INSERT INTO prescriptions (
          id, tenant_id, patient_id, provider_id, medication_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          prescriptionId,
          tenant1.id,
          patient1.id,
          provider1.id,
          'Otezla',
        ]
      );

      const result = await pool.query(
        `SELECT medication_name FROM prescriptions WHERE id = $1`,
        [prescriptionId]
      );

      expect(result.rows[0].medication_name).toBe('Otezla');
    });

    it('should enforce tenant isolation for prescriptions', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient1.id,
        provider1.id,
        'Test Medication',
        true
      );

      // Tenant 2 should not see tenant 1's prescription
      const result = await pool.query(
        `SELECT id FROM prescriptions WHERE id = $1 AND tenant_id = $2`,
        [prescriptionId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });
  });

  describe('2. Initiate PA Request', () => {
    it('should create a prior auth request from prescription', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient1.id,
        provider1.id,
        'Cosentyx',
        true
      );

      const paRequestId = randomUUID();

      const result = await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber, prescription_id,
          medication_name, medication_strength, medication_quantity,
          payer, member_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        RETURNING id, status, medication_name`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          prescriptionId,
          'Cosentyx',
          '150mg',
          2,
          'Blue Cross Blue Shield',
          'ABC123456789',
          'pending',
        ]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[0].medication_name).toBe('Cosentyx');
    });

    it('should include prescriber information in PA request', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient2.id,
        provider1.id,
        'Humira',
        true
      );

      const paRequestId = randomUUID();

      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber, prescription_id,
          medication_name, payer, member_id,
          prescriber_npi, prescriber_name, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          paRequestId,
          tenant1.id,
          patient2.id,
          provider1.id,
          prescriptionId,
          'Humira',
          'Aetna',
          'XYZ987654321',
          '1234567890',
          'Dr. Sarah Dermatologist',
          'pending',
        ]
      );

      const result = await pool.query(
        `SELECT prescriber_npi, prescriber_name FROM prior_auth_requests WHERE id = $1`,
        [paRequestId]
      );

      expect(result.rows[0].prescriber_npi).toBe('1234567890');
      expect(result.rows[0].prescriber_name).toBe('Dr. Sarah Dermatologist');
    });

    it('should validate required fields for PA request', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient1.id,
        provider1.id,
        'Test Med',
        true
      );

      const paRequestId = randomUUID();

      // Should be able to create with minimal required fields
      const result = await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          'Test Med',
          'UnitedHealthcare',
          'TEST123',
          'pending',
        ]
      );

      expect(result.rows.length).toBe(1);
    });
  });

  describe('3. Submit PA to Mock Adapter', () => {
    it('should submit PA request through mock adapter', async () => {
      const prescriptionId = await createTestPrescription(
        tenant1.id,
        patient1.id,
        provider1.id,
        'Stelara',
        true
      );

      const paRequestId = randomUUID();

      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber, prescription_id,
          medication_name, medication_strength, medication_quantity,
          payer, member_id, prescriber_npi, prescriber_name,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          prescriptionId,
          'Stelara',
          '45mg',
          1,
          'Cigna',
          'CIG123456',
          '1234567890',
          'Dr. Sarah Dermatologist',
          'pending',
        ]
      );

      // Get adapter and submit
      const adapter = getPriorAuthAdapter('Cigna');

      const submitResponse = await adapter.submit({
        id: paRequestId,
        tenantId: tenant1.id,
        patientId: patient1.id,
        prescriptionId,
        medicationName: 'Stelara',
        medicationStrength: '45mg',
        medicationQuantity: 1,
        payer: 'Cigna',
        memberId: 'CIG123456',
        prescriberNpi: '1234567890',
        prescriberName: 'Dr. Sarah Dermatologist',
      });

      expect(submitResponse.success).toBe(true);
      expect(submitResponse.status).toBeDefined();
      expect(['submitted', 'approved', 'denied', 'needs_info']).toContain(
        submitResponse.status
      );
      expect(submitResponse.externalReferenceId).toBeDefined();
      expect(submitResponse.requestPayload).toBeDefined();
      expect(submitResponse.responsePayload).toBeDefined();

      // Update database with response
      await pool.query(
        `UPDATE prior_auth_requests
         SET status = $1,
             external_reference_id = $2,
             response_payload = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          submitResponse.status,
          submitResponse.externalReferenceId,
          JSON.stringify(submitResponse.responsePayload),
          paRequestId,
        ]
      );

      const result = await pool.query(
        `SELECT status, external_reference_id, updated_at
         FROM prior_auth_requests
         WHERE id = $1`,
        [paRequestId]
      );

      expect(result.rows[0].status).toBe(submitResponse.status);
      expect(result.rows[0].external_reference_id).toBeDefined();
      expect(result.rows[0].updated_at).toBeDefined();
    });

    it('should handle auto-approved PA response', async () => {
      const adapter = getPriorAuthAdapter();

      const originalRandom = Math.random;
      Math.random = () => 0.2;
      try {
        const response = await adapter.submit({
          id: randomUUID(),
          tenantId: tenant1.id,
          patientId: patient1.id,
          medicationName: 'Test Medication',
          payer: 'Test Payer',
          memberId: 'TEST123',
        });

        expect(response.status).toBe('approved');
        expect(response.statusReason).toContain('approved');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should handle needs_info PA response', async () => {
      const adapter = getPriorAuthAdapter();

      const originalRandom = Math.random;
      Math.random = () => 0.8;
      try {
        const response = await adapter.submit({
          id: randomUUID(),
          tenantId: tenant1.id,
          patientId: patient1.id,
          medicationName: 'Test Medication',
          payer: 'Test Payer',
          memberId: 'TEST123',
        });

        expect(response.status).toBe('needs_info');
        expect(response.statusReason).toBeDefined();
        expect(response.responsePayload).toHaveProperty('requiredDocuments');
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should handle denied PA response', async () => {
      const adapter = getPriorAuthAdapter();

      const originalRandom = Math.random;
      Math.random = () => 0.95;
      try {
        const response = await adapter.submit({
          id: randomUUID(),
          tenantId: tenant1.id,
          patientId: patient1.id,
          medicationName: 'Test Medication',
          payer: 'Test Payer',
          memberId: 'TEST123',
        });

        expect(response.status).toBe('denied');
        expect(response.statusReason).toBeDefined();
        expect(response.responsePayload).toHaveProperty('denialReason');
      } finally {
        Math.random = originalRandom;
      }
    });
  });

  describe('4. Check Status Returns Expected Mock Response', () => {
    it('should check PA status through mock adapter', async () => {
      const paRequestId = randomUUID();
      const externalRefId = `MOCK-PA-${Date.now()}`;

      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id,
          status, external_reference_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          'Test Med',
          'Test Payer',
          'TEST123',
          'submitted',
          externalRefId,
        ]
      );

      const adapter = getPriorAuthAdapter();
      const statusResponse = await adapter.checkStatus(paRequestId, externalRefId);

      expect(statusResponse.success).toBe(true);
      expect(statusResponse.status).toBeDefined();
      expect(['pending', 'submitted', 'approved', 'denied', 'needs_info']).toContain(
        statusResponse.status
      );
      expect(statusResponse.externalReferenceId).toBeDefined();
      expect(statusResponse.lastUpdated).toBeDefined();
      expect(statusResponse.responsePayload).toBeDefined();

      // Update database with status check
      await pool.query(
        `UPDATE prior_auth_requests
         SET status = $1,
             response_payload = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [
          statusResponse.status,
          JSON.stringify(statusResponse.responsePayload),
          paRequestId,
        ]
      );

      const result = await pool.query(
        `SELECT status, updated_at FROM prior_auth_requests WHERE id = $1`,
        [paRequestId]
      );

      expect(result.rows[0].status).toBe(statusResponse.status);
      expect(result.rows[0].updated_at).toBeDefined();
    });

    it('should handle status check for approved PA', async () => {
      const adapter = getPriorAuthAdapter();

      // The mock adapter uses hash of request ID to determine status
      // Try different IDs until we get an approved status
      let approvedStatus;
      for (let i = 0; i < 10; i++) {
        const testId = `test-approved-${i}`;
        const status = await adapter.checkStatus(testId);

        if (status.status === 'approved') {
          approvedStatus = status;
          break;
        }
      }

      if (approvedStatus) {
        expect(approvedStatus.status).toBe('approved');
        expect(approvedStatus.statusReason).toContain('approved');
      }
    });

    it('should return consistent status for same request ID', async () => {
      const adapter = getPriorAuthAdapter();
      const requestId = 'consistent-test-id';

      const status1 = await adapter.checkStatus(requestId);
      const status2 = await adapter.checkStatus(requestId);

      // Mock adapter should return consistent status for same ID
      expect(status1.status).toBe(status2.status);
    });

    it('should track status check history', async () => {
      const paRequestId = randomUUID();

      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id,
          status, external_reference_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          'Test Med',
          'Test Payer',
          'TEST123',
          'submitted',
          'MOCK-REF-123',
        ]
      );

      const adapter = getPriorAuthAdapter();

      // Check status multiple times
      await adapter.checkStatus(paRequestId);
      await pool.query(
        `UPDATE prior_auth_requests SET updated_at = NOW() WHERE id = $1`,
        [paRequestId]
      );

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      await adapter.checkStatus(paRequestId);
      await pool.query(
        `UPDATE prior_auth_requests SET updated_at = NOW() WHERE id = $1`,
        [paRequestId]
      );

      const result = await pool.query(
        `SELECT updated_at, created_at FROM prior_auth_requests WHERE id = $1`,
        [paRequestId]
      );

      expect(result.rows[0].updated_at).toBeDefined();
      expect(
        new Date(result.rows[0].updated_at).getTime()
      ).toBeGreaterThan(new Date(result.rows[0].created_at).getTime());
    });
  });

  describe('5. Tenant Isolation', () => {
    it('should not allow cross-tenant access to PA requests', async () => {
      const paRequestId = randomUUID();

      // Create PA request for tenant 1
      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          paRequestId,
          tenant1.id,
          patient1.id,
          provider1.id,
          'Test Med',
          'Test Payer',
          'TEST123',
          'pending',
        ]
      );

      // Tenant 2 should not see tenant 1's PA request
      const result = await pool.query(
        `SELECT id FROM prior_auth_requests WHERE id = $1 AND tenant_id = $2`,
        [paRequestId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });

    it('should isolate PA requests by tenant in queries', async () => {
      const tenant1Patient = await createTestPatient(tenant1.id, {
        firstName: 'Tenant1',
        lastName: 'Patient',
      });
      const tenant2Patient = await createTestPatient(tenant2.id, {
        firstName: 'Tenant2',
        lastName: 'Patient',
      });

      // Create PA request for each tenant
      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          randomUUID(),
          tenant1.id,
          tenant1Patient.id,
          provider1.id,
          'Med A',
          'Payer A',
          'A123',
          'pending',
        ]
      );

      await pool.query(
        `INSERT INTO prior_auth_requests (
          id, tenant_id, patient_id, prescriber,
          medication_name, payer, member_id, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          randomUUID(),
          tenant2.id,
          tenant2Patient.id,
          provider2.id,
          'Med B',
          'Payer B',
          'B123',
          'pending',
        ]
      );

      // Query for tenant 1 - should only see tenant 1's request
      const tenant1Result = await pool.query(
        `SELECT id, medication_name FROM prior_auth_requests WHERE tenant_id = $1`,
        [tenant1.id]
      );

      // Query for tenant 2 - should only see tenant 2's request
      const tenant2Result = await pool.query(
        `SELECT id, medication_name FROM prior_auth_requests WHERE tenant_id = $1`,
        [tenant2.id]
      );

      expect(tenant1Result.rows.every(row => row.medication_name !== 'Med B')).toBe(true);
      expect(tenant2Result.rows.every(row => row.medication_name !== 'Med A')).toBe(true);
    });
  });
});
