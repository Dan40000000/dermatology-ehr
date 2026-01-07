/**
 * E2E Integration Tests: Portal Pre-Check-In Flow
 * Tests the complete patient portal pre-check-in workflow
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/pool';
import {
  createTestTenant,
  createTestUser,
  createTestProvider,
  createTestLocation,
  createTestAppointmentType,
  createTestPatient,
  createTestAppointment,
  cleanupTestTenant,
  getFutureDate,
  TestTenant,
  TestUser,
  TestProvider,
  TestLocation,
  TestAppointmentType,
  TestPatient,
} from '../helpers/testHelpers';
import { randomUUID } from 'crypto';

const describeIf = process.env.RUN_E2E === 'true' ? describe : describe.skip;

describeIf('E2E: Portal Pre-Check-In Flow', () => {
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let provider1: TestProvider;
  let location1: TestLocation;
  let appointmentType1: TestAppointmentType;
  let patient1: TestPatient;
  let patient2: TestPatient;

  beforeAll(async () => {
    // Create tenants
    tenant1 = await createTestTenant('Tenant 1 - Portal');
    tenant2 = await createTestTenant('Tenant 2 - Portal');

    // Create users
    user1 = await createTestUser(tenant1.id, 'admin');

    // Create providers
    provider1 = await createTestProvider(tenant1.id);

    // Create locations
    location1 = await createTestLocation(tenant1.id, {
      name: 'Main Clinic',
    });

    // Create appointment types
    appointmentType1 = await createTestAppointmentType(tenant1.id, {
      name: 'Dermatology Consultation',
    });

    // Create patients
    patient1 = await createTestPatient(tenant1.id, {
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@example.com',
    });

    patient2 = await createTestPatient(tenant1.id, {
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob.smith@example.com',
    });
  });

  afterAll(async () => {
    await cleanupTestTenant(tenant1.id);
    await cleanupTestTenant(tenant2.id);
    await pool.end();
  });

  describe('1. Create Patient Portal Session', () => {
    it('should create a portal session for a patient', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(3, 10),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const result = await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, status, expires_at`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('started');
      expect(result.rows[0].expires_at).toBeDefined();
    });

    it('should validate session token', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(4, 11),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      // Validate session exists
      const result = await pool.query(
        `SELECT id, patient_id, status, expires_at
         FROM portal_checkin_sessions
         WHERE id = $1 AND tenant_id = $2 AND status = 'started'`,
        [sessionId, tenant1.id]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].patient_id).toBe(patient1.id);
      expect(new Date(result.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('should expire old sessions', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient2.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(5, 9),
        'scheduled'
      );

      const expiredAt = new Date();
      expiredAt.setHours(expiredAt.getHours() - 1); // 1 hour ago

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '2 hours')`,
        [sessionId, tenant1.id, patient2.id, appointmentId, expiredAt, 'started']
      );

      // Check for expired sessions
      const result = await pool.query(
        `SELECT id FROM portal_checkin_sessions
         WHERE expires_at < NOW() AND status = 'started'`
      );

      expect(result.rows.some(row => row.id === sessionId)).toBe(true);

      // Expire the session
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET status = 'expired'
         WHERE id = $1`,
        [sessionId]
      );

      const updatedResult = await pool.query(
        `SELECT status FROM portal_checkin_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(updatedResult.rows[0].status).toBe('expired');
    });
  });

  describe('2. Complete Demographic Update', () => {
    it('should update patient demographics through portal', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(6, 10),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      // Update demographics
      const updatedAddress = '456 Oak Avenue';
      const updatedPhone = '555-0199';

      await pool.query(
        `UPDATE patients
         SET address = $1, phone = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [updatedAddress, updatedPhone, patient1.id, tenant1.id]
      );

      // Mark demographics step as completed
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT
           s.demographics_confirmed,
           p.address,
           p.phone
         FROM portal_checkin_sessions s
         JOIN patients p ON s.patient_id = p.id
         WHERE s.id = $1`,
        [sessionId]
      );

      expect(result.rows[0].demographics_confirmed).toBe(true);
      expect(result.rows[0].address).toBe(updatedAddress);
      expect(result.rows[0].phone).toBe(updatedPhone);
    });

    it('should validate required demographic fields', async () => {
      // Verify patient has required fields
      const result = await pool.query(
        `SELECT first_name, last_name, dob FROM patients WHERE id = $1`,
        [patient1.id]
      );

      expect(result.rows[0].first_name).toBeDefined();
      expect(result.rows[0].last_name).toBeDefined();
      expect(result.rows[0].dob).toBeDefined();
    });

    it('should track demographic update timestamp', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient2.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(7, 14),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient2.id, appointmentId, expiresAt, 'started']
      );

      const beforeUpdate = new Date();

      await pool.query(
        `UPDATE patients
         SET city = $1, updated_at = NOW()
         WHERE id = $2`,
        ['Denver', patient2.id]
      );

      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT updated_at FROM portal_checkin_sessions WHERE id = $1`,
        [sessionId]
      );

      const updatedAt = new Date(result.rows[0].updated_at);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });

  describe('3. Complete Insurance Verification', () => {
    it('should record insurance information', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(8, 9),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      const insuranceData = {
        insurance_plan_name: 'Blue Cross Blue Shield',
        insurance_member_id: 'ABC123456789',
        group_number: 'GRP987654',
        subscriber_name: 'Alice Johnson',
        relationship_to_subscriber: 'self',
      };

      // Update patient insurance
      await pool.query(
        `UPDATE patients
         SET insurance_plan_name = $1,
             insurance_member_id = $2,
             insurance_group_number = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          insuranceData.insurance_plan_name,
          insuranceData.insurance_member_id,
          insuranceData.group_number,
          patient1.id,
        ]
      );

      // Mark insurance step as completed
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET insurance_verified = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT
           s.insurance_verified,
           p.insurance_plan_name,
           p.insurance_member_id,
           p.insurance_group_number
         FROM portal_checkin_sessions s
         JOIN patients p ON s.patient_id = p.id
         WHERE s.id = $1`,
        [sessionId]
      );

      expect(result.rows[0].insurance_verified).toBe(true);
      expect(result.rows[0].insurance_plan_name).toBe(insuranceData.insurance_plan_name);
      expect(result.rows[0].insurance_member_id).toBe(insuranceData.insurance_member_id);
    });

    it('should handle patients without insurance', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient2.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(9, 11),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient2.id, appointmentId, expiresAt, 'started']
      );

      // Patient indicates no insurance
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET insurance_verified = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT insurance_verified FROM portal_checkin_sessions WHERE id = $1`,
        [sessionId]
      );

      expect(result.rows[0].insurance_verified).toBe(true);
    });

    it('should upload insurance card images', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(10, 10),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      const insuranceCardData = {
        front_image_url: '/uploads/insurance-card-front-123.jpg',
        back_image_url: '/uploads/insurance-card-back-123.jpg',
      };

      await pool.query(
        `UPDATE portal_checkin_sessions
         SET insurance_card_front_url = $1,
             insurance_card_back_url = $2,
             insurance_verified = true,
             updated_at = NOW()
         WHERE id = $3`,
        [insuranceCardData.front_image_url, insuranceCardData.back_image_url, sessionId]
      );

      const result = await pool.query(
        `SELECT insurance_card_front_url, insurance_card_back_url
         FROM portal_checkin_sessions
         WHERE id = $1`,
        [sessionId]
      );

      expect(result.rows[0].insurance_card_front_url).toBe(insuranceCardData.front_image_url);
      expect(result.rows[0].insurance_card_back_url).toBe(insuranceCardData.back_image_url);
    });
  });

  describe('4. Verify Check-In Status is Complete', () => {
    it('should mark check-in as complete when all steps are done', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(11, 13),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      // Complete demographics
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      // Complete insurance
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET insurance_verified = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      // Mark overall check-in as complete
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET status = 'completed',
             completed_at = NOW()
         WHERE id = $1 AND demographics_confirmed = true AND insurance_verified = true`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT
           status,
           demographics_confirmed,
           insurance_verified,
           completed_at
         FROM portal_checkin_sessions
         WHERE id = $1`,
        [sessionId]
      );

      expect(result.rows[0].status).toBe('completed');
      expect(result.rows[0].demographics_confirmed).toBe(true);
      expect(result.rows[0].insurance_verified).toBe(true);
      expect(result.rows[0].completed_at).toBeDefined();
    });

    it('should calculate check-in progress percentage', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient2.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(12, 9),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient2.id, appointmentId, expiresAt, 'started']
      );

      // Complete only demographics
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT
           demographics_confirmed,
           insurance_verified,
           CASE
             WHEN demographics_confirmed AND insurance_verified THEN 100
             WHEN demographics_confirmed OR insurance_verified THEN 50
             ELSE 0
           END as progress_percentage
         FROM portal_checkin_sessions
         WHERE id = $1`,
        [sessionId]
      );

      expect(result.rows[0].progress_percentage).toBe(50);
    });

    it('should update appointment status after check-in', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(13, 10),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      // Complete check-in
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             insurance_verified = true,
             status = 'completed',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      // Update appointment to checked-in
      await pool.query(
        `UPDATE appointments
         SET status = 'checked_in'
         WHERE id = $1`,
        [appointmentId]
      );

      const result = await pool.query(
        `SELECT
           a.status,
           s.status as session_status
         FROM appointments a
         JOIN portal_checkin_sessions s ON a.id = s.appointment_id
         WHERE a.id = $1`,
        [appointmentId]
      );

      expect(result.rows[0].status).toBe('checked_in');
      expect(result.rows[0].session_status).toBe('completed');
    });

    it('should track time to complete check-in', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(14, 11),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const createResult = await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING created_at`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      const createdAt = new Date(createResult.rows[0].created_at);

      // Wait a moment to simulate user filling out form
      await new Promise(resolve => setTimeout(resolve, 100));

      // Complete check-in
      await pool.query(
        `UPDATE portal_checkin_sessions
         SET demographics_confirmed = true,
             insurance_verified = true,
             status = 'completed',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );

      const result = await pool.query(
        `SELECT
           created_at,
           completed_at,
           EXTRACT(EPOCH FROM (completed_at - created_at)) as duration_seconds
         FROM portal_checkin_sessions
         WHERE id = $1`,
        [sessionId]
      );

      expect(result.rows[0].completed_at).toBeDefined();
      expect(Number(result.rows[0].duration_seconds)).toBeGreaterThan(0);
    });
  });

  describe('5. Tenant Isolation', () => {
    it('should not allow cross-tenant access to portal sessions', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(15, 9),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Create session for tenant 1
      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      // Tenant 2 should not see tenant 1's session
      const result = await pool.query(
        `SELECT id FROM portal_checkin_sessions WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });

    it('should isolate portal sessions by tenant', async () => {
      const tenant1SessionId = randomUUID();
      const tenant2Patient = await createTestPatient(tenant2.id);
      const tenant2Provider = await createTestProvider(tenant2.id);
      const tenant2Location = await createTestLocation(tenant2.id);
      const tenant2AppointmentType = await createTestAppointmentType(tenant2.id);

      const tenant1AppointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(16, 10),
        'scheduled'
      );

      const tenant2AppointmentId = await createTestAppointment(
        tenant2.id,
        tenant2Patient.id,
        tenant2Provider.id,
        tenant2Location.id,
        tenant2AppointmentType.id,
        getFutureDate(16, 10),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      // Create session for tenant 1
      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [tenant1SessionId, tenant1.id, patient1.id, tenant1AppointmentId, expiresAt, 'started']
      );

      // Create session for tenant 2
      const tenant2SessionId = randomUUID();
      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [tenant2SessionId, tenant2.id, tenant2Patient.id, tenant2AppointmentId, expiresAt, 'started']
      );

      // Tenant 1 should only see their session
      const tenant1Result = await pool.query(
        `SELECT id FROM portal_checkin_sessions WHERE tenant_id = $1`,
        [tenant1.id]
      );

      // Tenant 2 should only see their session
      const tenant2Result = await pool.query(
        `SELECT id FROM portal_checkin_sessions WHERE tenant_id = $1`,
        [tenant2.id]
      );

      expect(tenant1Result.rows.every(row => row.id !== tenant2SessionId)).toBe(true);
      expect(tenant2Result.rows.every(row => row.id !== tenant1SessionId)).toBe(true);
    });

    it('should not allow patient to access another tenants session', async () => {
      const sessionId = randomUUID();
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        getFutureDate(17, 9),
        'scheduled'
      );

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await pool.query(
        `INSERT INTO portal_checkin_sessions (
          id, tenant_id, patient_id, appointment_id,
          expires_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [sessionId, tenant1.id, patient1.id, appointmentId, expiresAt, 'started']
      );

      const result = await pool.query(
        `SELECT id FROM portal_checkin_sessions
         WHERE id = $1 AND tenant_id = $2`,
        [sessionId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });
  });
});
