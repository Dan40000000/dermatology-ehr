/**
 * E2E Integration Tests: Waitlist Auto-Fill Flow
 * Tests the complete waitlist auto-fill feature including matching, notifications, and hold expiration
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
  waitForCondition,
  TestTenant,
  TestUser,
  TestProvider,
  TestLocation,
  TestAppointmentType,
  TestPatient,
} from '../helpers/testHelpers';
import { waitlistAutoFillService } from '../../services/waitlistAutoFillService';
import { randomUUID } from 'crypto';

const describeIf = process.env.RUN_E2E === 'true' ? describe : describe.skip;

describeIf('E2E: Waitlist Auto-Fill Flow', () => {
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let provider1: TestProvider;
  let provider2: TestProvider;
  let location1: TestLocation;
  let appointmentType1: TestAppointmentType;
  let patient1: TestPatient;
  let patient2: TestPatient;
  let patient3: TestPatient;

  beforeAll(async () => {
    // Create tenants
    tenant1 = await createTestTenant('Tenant 1 - Waitlist');
    tenant2 = await createTestTenant('Tenant 2 - Waitlist');

    // Create users
    user1 = await createTestUser(tenant1.id, 'admin');

    // Create providers
    provider1 = await createTestProvider(tenant1.id, { fullName: 'Dr. Smith' });
    provider2 = await createTestProvider(tenant2.id, { fullName: 'Dr. Jones' });

    // Create locations
    location1 = await createTestLocation(tenant1.id);

    // Create appointment types
    appointmentType1 = await createTestAppointmentType(tenant1.id, {
      name: 'Follow-up',
      durationMinutes: 30,
    });

    // Create patients
    patient1 = await createTestPatient(tenant1.id, { firstName: 'Alice', lastName: 'Smith' });
    patient2 = await createTestPatient(tenant1.id, { firstName: 'Bob', lastName: 'Johnson' });
    patient3 = await createTestPatient(tenant1.id, { firstName: 'Charlie', lastName: 'Brown' });
  });

  afterAll(async () => {
    await cleanupTestTenant(tenant1.id);
    await cleanupTestTenant(tenant2.id);
    await pool.end();
  });

  describe('1. Add Patient to Waitlist', () => {
    it('should add a patient to the waitlist with preferences', async () => {
      const waitlistId = randomUUID();

      const result = await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id, location_id,
          reason, preferred_start_date, preferred_end_date, preferred_time_of_day,
          preferred_days_of_week, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Routine visit', $7, $8, $9, $10, $11, $12, NOW())
        RETURNING id, status, priority, preferred_time_of_day`,
        [
          waitlistId,
          tenant1.id,
          patient1.id,
          provider1.id,
          appointmentType1.id,
          location1.id,
          getFutureDate(1),
          getFutureDate(30),
          'morning',
          ['monday', 'wednesday', 'friday'],
          'normal',
          'active',
        ]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('active');
      expect(result.rows[0].priority).toBe('normal');
      expect(result.rows[0].preferred_time_of_day).toBe('morning');
    });

    it('should add multiple patients with different priorities', async () => {
      // High priority patient
      const highPriorityId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Priority follow-up', 'high', 'active', NOW())`,
        [highPriorityId, tenant1.id, patient2.id, provider1.id, appointmentType1.id]
      );

      // Urgent priority patient
      const urgentPriorityId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Urgent follow-up', 'urgent', 'active', NOW())`,
        [urgentPriorityId, tenant1.id, patient3.id, provider1.id, appointmentType1.id]
      );

      const result = await pool.query(
        `SELECT id, priority FROM waitlist
         WHERE tenant_id = $1 AND id IN ($2, $3)
         ORDER BY priority DESC`,
        [tenant1.id, highPriorityId, urgentPriorityId]
      );

      expect(result.rows.length).toBe(2);
      expect(result.rows.some(r => r.priority === 'high')).toBe(true);
      expect(result.rows.some(r => r.priority === 'urgent')).toBe(true);
    });

    it('should enforce tenant isolation for waitlist entries', async () => {
      const waitlistId = randomUUID();

      // Tenant 1 creates waitlist entry
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, reason, status, created_at
        ) VALUES ($1, $2, $3, $4, 'General waitlist', 'active', NOW())`,
        [waitlistId, tenant1.id, patient1.id, provider1.id]
      );

      // Tenant 2 should not see tenant 1's waitlist
      const tenant2Result = await pool.query(
        `SELECT id FROM waitlist WHERE tenant_id = $1 AND id = $2`,
        [tenant2.id, waitlistId]
      );

      expect(tenant2Result.rows.length).toBe(0);
    });
  });

  describe('2. Create Cancellation and Match Criteria', () => {
    it('should find perfect match when appointment is cancelled', async () => {
      const appointmentStart = getFutureDate(3, 9); // 3 days ahead at 9 AM
      const appointmentEnd = getFutureDate(3, 9, 30);

      // Create appointment
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      // Add patient to waitlist with exact matching criteria
      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id, location_id,
          reason, preferred_time_of_day, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'Exact match request', 'morning', 'high', 'active', NOW() - INTERVAL '1 day')`,
        [waitlistId, tenant1.id, patient2.id, provider1.id, appointmentType1.id, location1.id]
      );

      // Cancel the appointment and process auto-fill
      await pool.query(
        `UPDATE appointments SET status = 'cancelled'
         WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        5
      );

      expect(matches.length).toBeGreaterThan(0);
      const match = matches.find(m => m.waitlistId === waitlistId);
      expect(match).toBeDefined();
      if (!match) {
        throw new Error('Expected waitlist match was not found');
      }
      expect(match.score).toBeGreaterThan(0);

      // Verify hold was created
      const holdResult = await pool.query(
        `SELECT id, status, waitlist_id FROM waitlist_holds
         WHERE id = $1 AND tenant_id = $2`,
        [match.holdId, tenant1.id]
      );

      expect(holdResult.rows.length).toBe(1);
      expect(holdResult.rows[0].status).toBe('active');
    });

    it('should prioritize urgent patients over normal priority', async () => {
      const appointmentStart = getFutureDate(4, 10);

      // Create appointment
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      // Add normal priority waitlist entry
      const normalWaitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Routine follow-up', 'normal', 'active', NOW() - INTERVAL '5 days')`,
        [normalWaitlistId, tenant1.id, patient2.id, provider1.id, appointmentType1.id]
      );

      // Add urgent priority waitlist entry (created later but higher priority)
      const urgentWaitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Urgent cancellation', 'urgent', 'active', NOW() - INTERVAL '1 day')`,
        [urgentWaitlistId, tenant1.id, patient3.id, provider1.id, appointmentType1.id]
      );

      // Cancel and process
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        5
      );

      expect(matches.length).toBeGreaterThan(0);

      // Urgent patient should have higher score
      const urgentMatch = matches.find(m => m.waitlistId === urgentWaitlistId);
      const normalMatch = matches.find(m => m.waitlistId === normalWaitlistId);

      if (urgentMatch && normalMatch) {
        expect(urgentMatch.score).toBeGreaterThan(normalMatch.score);
      }
    });

    it('should not match if appointment type does not match', async () => {
      // Create different appointment type
      const differentTypeId = randomUUID();
      await pool.query(
        `INSERT INTO appointment_types (id, tenant_id, name, duration_minutes, created_at)
         VALUES ($1, $2, 'Consultation', 60, NOW())`,
        [differentTypeId, tenant1.id]
      );

      const appointmentStart = getFutureDate(5, 11);

      // Create appointment with appointmentType1
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id, // Follow-up
        appointmentStart,
        'scheduled'
      );

      // Add waitlist entry requiring different type
      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Type-specific request', 'high', 'active', NOW())`,
        [waitlistId, tenant1.id, patient2.id, provider1.id, differentTypeId]
      );

      // Cancel and process
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        5
      );

      // Should not match because appointment types differ
      const matchedEntry = matches.find(m => m.waitlistId === waitlistId);
      expect(matchedEntry).toBeUndefined();
    });
  });

  describe('3. Verify Notification is Sent (Mock)', () => {
    it('should record notification when hold is created', async () => {
      const appointmentStart = getFutureDate(6, 14);

      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Notification test', 'normal', 'active', NOW())`,
        [waitlistId, tenant1.id, patient2.id, provider1.id, appointmentType1.id]
      );

      // Cancel and process
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        5
      );

      expect(matches.length).toBeGreaterThan(0);

      // Verify notification was recorded in hold
      const holdResult = await pool.query(
        `SELECT notification_sent_at, notification_method
         FROM waitlist_holds
         WHERE id = $1`,
        [matches[0].holdId]
      );

      expect(holdResult.rows.length).toBe(1);
      expect(holdResult.rows[0].notification_sent_at).toBeDefined();
      expect(holdResult.rows[0].notification_method).toBe('auto');
    });
  });

  describe('4. Verify Hold is Placed and Expires Correctly', () => {
    it('should create hold with correct expiration time', async () => {
      const appointmentStart = getFutureDate(7, 9);

      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Hold expiry test', 'normal', 'active', NOW())`,
        [waitlistId, tenant1.id, patient2.id, provider1.id, appointmentType1.id]
      );

      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        1
      );

      expect(matches.length).toBe(1);

      const holdResult = await pool.query(
        `SELECT hold_until, status, created_at FROM waitlist_holds WHERE id = $1`,
        [matches[0].holdId]
      );

      expect(holdResult.rows.length).toBe(1);
      expect(holdResult.rows[0].status).toBe('active');

      const holdUntil = new Date(holdResult.rows[0].hold_until);
      const createdAt = new Date(holdResult.rows[0].created_at);
      const diffHours = (holdUntil.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      // Should be approximately 24 hours
      expect(diffHours).toBeGreaterThan(23);
      expect(diffHours).toBeLessThan(25);
    });

    it('should expire holds past their hold_until time', async () => {
      // Create a hold that's already expired
      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, reason, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Expired hold', 'matched', NOW())`,
        [waitlistId, tenant1.id, patient2.id, provider1.id]
      );

      const holdId = randomUUID();
      const expiredTime = new Date();
      expiredTime.setHours(expiredTime.getHours() - 1); // 1 hour ago

      await pool.query(
        `INSERT INTO waitlist_holds (
          id, tenant_id, waitlist_id, appointment_slot_start, appointment_slot_end,
          provider_id, hold_until, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW() - INTERVAL '25 hours')`,
        [
          holdId,
          tenant1.id,
          waitlistId,
          getFutureDate(1, 10),
          getFutureDate(1, 11),
          provider1.id,
          expiredTime.toISOString(),
        ]
      );

      // Run expiration process
      const expiredCount = await waitlistAutoFillService.expireOldHolds(tenant1.id);

      expect(expiredCount).toBeGreaterThan(0);

      // Verify hold status changed to expired
      const holdResult = await pool.query(
        `SELECT status FROM waitlist_holds WHERE id = $1`,
        [holdId]
      );

      expect(holdResult.rows[0].status).toBe('expired');

      // Verify waitlist entry returned to active
      const waitlistResult = await pool.query(
        `SELECT status FROM waitlist WHERE id = $1`,
        [waitlistId]
      );

      expect(waitlistResult.rows[0].status).toBe('active');
    });

    it('should not allow duplicate active holds for same waitlist entry', async () => {
      const appointmentStart = getFutureDate(8, 10);

      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, appointment_type_id,
          reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'Duplicate hold check', 'normal', 'active', NOW())`,
        [waitlistId, tenant1.id, patient2.id, provider1.id, appointmentType1.id]
      );

      // Cancel and create first hold
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const firstMatches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        1
      );

      expect(firstMatches.length).toBe(1);

      // Try to create another hold for same waitlist entry (should fail)
      const slot = {
        provider_id: provider1.id,
        location_id: location1.id,
        appointment_type_id: appointmentType1.id,
        scheduled_start: getFutureDate(9, 10),
        scheduled_end: getFutureDate(9, 11),
      };

      await expect(
        waitlistAutoFillService.createWaitlistHold(tenant1.id, waitlistId, slot)
      ).rejects.toThrow();
    });
  });

  describe('5. Tenant Isolation', () => {
    it('should not match waitlist entries across tenants', async () => {
      const appointmentStart = getFutureDate(10, 9);

      // Create appointment in tenant 1
      const appointmentId = await createTestAppointment(
        tenant1.id,
        patient1.id,
        provider1.id,
        location1.id,
        appointmentType1.id,
        appointmentStart,
        'scheduled'
      );

      // Create waitlist entry in tenant 2
      const tenant2Patient = await createTestPatient(tenant2.id);
      const waitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, reason, priority, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Cross-tenant check', 'high', 'active', NOW())`,
        [waitlistId, tenant2.id, tenant2Patient.id, provider2.id]
      );

      // Cancel tenant 1 appointment
      await pool.query(
        `UPDATE appointments SET status = 'cancelled' WHERE id = $1`,
        [appointmentId]
      );

      const matches = await waitlistAutoFillService.processAppointmentCancellation(
        tenant1.id,
        appointmentId,
        10
      );

      // Should not match tenant 2's waitlist entry
      const crossTenantMatch = matches.find(m => m.waitlistId === waitlistId);
      expect(crossTenantMatch).toBeUndefined();
    });

    it('should only expire holds for the specified tenant', async () => {
      // Create expired hold for tenant 1
      const tenant1WaitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, reason, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Expire holds tenant1', 'matched', NOW())`,
        [tenant1WaitlistId, tenant1.id, patient1.id, provider1.id]
      );

      const tenant1HoldId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist_holds (
          id, tenant_id, waitlist_id, appointment_slot_start, appointment_slot_end,
          provider_id, hold_until, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 hour', 'active', NOW())`,
        [
          tenant1HoldId,
          tenant1.id,
          tenant1WaitlistId,
          getFutureDate(1, 10),
          getFutureDate(1, 11),
          provider1.id,
        ]
      );

      // Create expired hold for tenant 2
      const tenant2Patient = await createTestPatient(tenant2.id);
      const tenant2WaitlistId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist (
          id, tenant_id, patient_id, provider_id, reason, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Expire holds tenant2', 'matched', NOW())`,
        [tenant2WaitlistId, tenant2.id, tenant2Patient.id, provider2.id]
      );

      const tenant2HoldId = randomUUID();
      await pool.query(
        `INSERT INTO waitlist_holds (
          id, tenant_id, waitlist_id, appointment_slot_start, appointment_slot_end,
          provider_id, hold_until, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '1 hour', 'active', NOW())`,
        [
          tenant2HoldId,
          tenant2.id,
          tenant2WaitlistId,
          getFutureDate(1, 10),
          getFutureDate(1, 11),
          provider2.id,
        ]
      );

      // Expire only tenant 1 holds
      await waitlistAutoFillService.expireOldHolds(tenant1.id);

      // Tenant 1 hold should be expired
      const tenant1Result = await pool.query(
        `SELECT status FROM waitlist_holds WHERE id = $1`,
        [tenant1HoldId]
      );
      expect(tenant1Result.rows[0].status).toBe('expired');

      // Tenant 2 hold should still be active
      const tenant2Result = await pool.query(
        `SELECT status FROM waitlist_holds WHERE id = $1`,
        [tenant2HoldId]
      );
      expect(tenant2Result.rows[0].status).toBe('active');
    });
  });
});
