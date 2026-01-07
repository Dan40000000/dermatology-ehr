/**
 * E2E Integration Tests: Time Blocks Flow
 * Tests the complete time blocks feature including recurrence and appointment booking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { pool } from '../../db/pool';
import { randomUUID } from 'crypto';
import {
  createTestTenant,
  createTestUser,
  createTestProvider,
  createTestLocation,
  createTestAppointmentType,
  createTestPatient,
  cleanupTestTenant,
  getAuthHeaders,
  getFutureDate,
  TestTenant,
  TestUser,
  TestProvider,
  TestLocation,
  TestAppointmentType,
  TestPatient,
} from '../helpers/testHelpers';
import {
  expandRecurrence,
  parseRecurrencePattern,
  hasSchedulingConflict,
  getExpandedTimeBlocks,
} from '../../services/timeBlockService';

const describeIf = process.env.RUN_E2E === 'true' ? describe : describe.skip;

describeIf('E2E: Time Blocks Flow', () => {
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let user2: TestUser;
  let provider1: TestProvider;
  let provider2: TestProvider;
  let location1: TestLocation;
  let appointmentType1: TestAppointmentType;
  let patient1: TestPatient;

  beforeAll(async () => {
    // Create two tenants for isolation testing
    tenant1 = await createTestTenant('Tenant 1 - Time Blocks');
    tenant2 = await createTestTenant('Tenant 2 - Time Blocks');

    // Create users
    user1 = await createTestUser(tenant1.id, 'admin');
    user2 = await createTestUser(tenant2.id, 'admin');

    // Create providers
    provider1 = await createTestProvider(tenant1.id);
    provider2 = await createTestProvider(tenant2.id);

    // Create locations
    location1 = await createTestLocation(tenant1.id);

    // Create appointment types
    appointmentType1 = await createTestAppointmentType(tenant1.id);

    // Create patient
    patient1 = await createTestPatient(tenant1.id);
  });

  afterAll(async () => {
    await cleanupTestTenant(tenant1.id);
    await cleanupTestTenant(tenant2.id);
    await pool.end();
  });

  describe('1. Create Time Block with Recurrence', () => {
    it('should create a single (non-recurring) time block', async () => {
      const startTime = getFutureDate(1, 9); // Tomorrow at 9 AM
      const endTime = getFutureDate(1, 10); // Tomorrow at 10 AM
      const blockId = randomUUID();

      const result = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Admin Block', 'admin', $5, $6, false, 'active', NOW())
        RETURNING id, start_time, end_time, is_recurring`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_recurring).toBe(false);
      expect(result.rows[0].start_time).toBeDefined();
    });

    it('should create a recurring time block (weekly on Mon/Wed/Fri)', async () => {
      const startTime = getFutureDate(7, 14); // Next week at 2 PM
      const endTime = getFutureDate(7, 15); // Next week at 3 PM
      const blockId = randomUUID();

      const recurrencePattern = {
        pattern: 'weekly',
        days: [1, 3, 5], // Mon, Wed, Fri
        until: getFutureDate(90), // 90 days from now
      };

      const result = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time,
          is_recurring, recurrence_pattern, recurrence_end_date,
          status, created_at
        ) VALUES ($1, $2, $3, $4, 'Recurring Admin Time', 'admin', $5, $6, true, $7, $8, 'active', NOW())
        RETURNING id, is_recurring, recurrence_pattern`,
        [
          blockId,
          tenant1.id,
          provider1.id,
          location1.id,
          startTime,
          endTime,
          JSON.stringify(recurrencePattern),
          recurrencePattern.until,
        ]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].is_recurring).toBe(true);

      const parsed = parseRecurrencePattern(result.rows[0].recurrence_pattern);
      expect(parsed?.pattern).toBe('weekly');
      expect(parsed?.days).toEqual([1, 3, 5]);
    });

    it('should enforce tenant isolation when creating time blocks', async () => {
      // Tenant 1 creates a time block
      const startTime = getFutureDate(2, 10);
      const endTime = getFutureDate(2, 11);
      const blockId = randomUUID();

      const tenant1Result = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Tenant Block', 'blocked', $5, $6, false, 'active', NOW())
        RETURNING id`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      // Tenant 2 should not be able to see Tenant 1's time blocks
      const tenant2Result = await pool.query(
        `SELECT id FROM time_blocks
         WHERE tenant_id = $1 AND id = $2`,
        [tenant2.id, tenant1Result.rows[0].id]
      );

      expect(tenant2Result.rows.length).toBe(0);
    });
  });

  describe('2. Verify Block Expansion Logic', () => {
    it('should expand weekly recurrence pattern correctly', () => {
      const startTime = new Date('2025-01-06T09:00:00Z'); // Monday
      const endTime = new Date('2025-01-06T10:00:00Z');

      const pattern = {
        pattern: 'weekly' as const,
        days: [1, 3, 5], // Mon, Wed, Fri
        until: '2025-02-06T00:00:00Z', // 1 month
      };

      const instances = expandRecurrence(startTime, endTime, pattern, 20);

      expect(instances.length).toBeGreaterThan(0);

      // Verify first few instances fall on correct days
      const firstInstance = instances[0];
      expect(firstInstance.startTime.getDay()).toBe(1); // Monday

      // Check that all instances are on Mon/Wed/Fri
      instances.forEach(inst => {
        const day = inst.startTime.getDay();
        expect([1, 3, 5]).toContain(day);
      });
    });

    it('should expand daily recurrence pattern correctly', () => {
      const startTime = new Date('2025-01-06T14:00:00Z');
      const endTime = new Date('2025-01-06T15:00:00Z');

      const pattern = {
        pattern: 'daily' as const,
        until: '2025-01-16T00:00:00Z', // 10 days
      };

      const instances = expandRecurrence(startTime, endTime, pattern, 15);

      expect(instances.length).toBeGreaterThanOrEqual(10);

      // Verify instances are consecutive days
      for (let i = 1; i < Math.min(instances.length, 5); i++) {
        const prevDate = instances[i - 1].startTime.getDate();
        const currDate = instances[i].startTime.getDate();
        expect(currDate - prevDate).toBeLessThanOrEqual(1);
      }
    });

    it('should expand monthly recurrence pattern correctly', () => {
      const startTime = new Date('2025-01-15T10:00:00Z'); // 15th of month
      const endTime = new Date('2025-01-15T11:00:00Z');

      const pattern = {
        pattern: 'monthly' as const,
        dayOfMonth: 15,
        until: '2025-05-15T00:00:00Z', // 4 months
      };

      const instances = expandRecurrence(startTime, endTime, pattern, 10);

      expect(instances.length).toBeGreaterThanOrEqual(4);

      // All instances should be on the 15th
      instances.forEach(inst => {
        expect(inst.startTime.getDate()).toBe(15);
      });
    });

    it('should retrieve expanded time blocks for a date range', async () => {
      const startTime = getFutureDate(14, 9); // 2 weeks ahead
      const endTime = getFutureDate(14, 10);
      const blockId = randomUUID();

      const pattern = {
        pattern: 'weekly',
        days: [2, 4], // Tue, Thu
        until: getFutureDate(60),
      };

      // Create recurring time block
      await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, recurrence_pattern, recurrence_end_date,
          status, created_at
        ) VALUES ($1, $2, $3, $4, 'Recurring Block', 'blocked', $5, $6, true, $7, $8, 'active', NOW())`,
        [
          blockId,
          tenant1.id,
          provider1.id,
          location1.id,
          startTime,
          endTime,
          JSON.stringify(pattern),
          pattern.until,
        ]
      );

      // Get expanded blocks for next 30 days
      const rangeStart = new Date(startTime);
      const rangeEnd = new Date(startTime);
      rangeEnd.setDate(rangeEnd.getDate() + 30);

      const expanded = await getExpandedTimeBlocks(
        tenant1.id,
        provider1.id,
        location1.id,
        rangeStart,
        rangeEnd
      );

      expect(expanded.length).toBeGreaterThan(0);
    });
  });

  describe('3. Book Appointment within Time Block', () => {
    it('should detect conflict when booking appointment during time block', async () => {
      const startTime = getFutureDate(3, 13); // 3 days ahead at 1 PM
      const endTime = getFutureDate(3, 14); // 3 days ahead at 2 PM
      const blockId = randomUUID();

      // Create a time block
      await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Conflict Block', 'blocked', $5, $6, false, 'active', NOW())`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      // Try to check for conflicts at the same time
      const conflict = await hasSchedulingConflict(
        tenant1.id,
        provider1.id,
        startTime,
        endTime
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.conflictType).toBe('time_block');
    });

    it('should allow booking appointment outside time block', async () => {
      const blockStart = getFutureDate(4, 9); // 4 days ahead at 9 AM
      const blockEnd = getFutureDate(4, 10);
      const blockId = randomUUID();

      // Create a time block
      await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Morning Block', 'blocked', $5, $6, false, 'active', NOW())`,
        [blockId, tenant1.id, provider1.id, location1.id, blockStart, blockEnd]
      );

      // Check for conflict at different time (11 AM)
      const apptStart = getFutureDate(4, 11);
      const apptEnd = getFutureDate(4, 12);

      const conflict = await hasSchedulingConflict(
        tenant1.id,
        provider1.id,
        apptStart,
        apptEnd
      );

      expect(conflict.hasConflict).toBe(false);
    });

    it('should prevent overlapping time blocks for same provider', async () => {
      const startTime = getFutureDate(5, 10);
      const endTime = getFutureDate(5, 11);
      const blockId = randomUUID();

      // Create first time block
      const firstBlock = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Overlap Block', 'blocked', $5, $6, false, 'active', NOW())
        RETURNING id`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      // Try to create overlapping block (should detect conflict)
      const overlapStart = getFutureDate(5, 10, 30); // 10:30 AM
      const overlapEnd = getFutureDate(5, 11, 30); // 11:30 AM

      const conflict = await hasSchedulingConflict(
        tenant1.id,
        provider1.id,
        overlapStart,
        overlapEnd
      );

      expect(conflict.hasConflict).toBe(true);
    });
  });

  describe('4. Time Block Status Management', () => {
    it('should create time block in active status', async () => {
      const startTime = getFutureDate(6, 15);
      const endTime = getFutureDate(6, 16);
      const blockId = randomUUID();

      const result = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Status Block', 'blocked', $5, $6, false, 'active', NOW())
        RETURNING id, status`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      expect(result.rows[0].status).toBe('active');
    });

    it('should allow cancelling a time block', async () => {
      const startTime = getFutureDate(7, 9);
      const endTime = getFutureDate(7, 10);
      const blockId = randomUUID();

      await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Cancelable Block', 'blocked', $5, $6, false, 'active', NOW())
        `,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      // Cancel the block
      const updateResult = await pool.query(
        `UPDATE time_blocks
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING status`,
        [blockId, tenant1.id]
      );

      expect(updateResult.rows[0].status).toBe('cancelled');

      // Cancelled blocks should not cause conflicts
      const conflict = await hasSchedulingConflict(
        tenant1.id,
        provider1.id,
        startTime,
        endTime
      );

      expect(conflict.hasConflict).toBe(false);
    });
  });

  describe('5. Tenant Isolation', () => {
    it('should not allow cross-tenant access to time blocks', async () => {
      const startTime = getFutureDate(8, 10);
      const endTime = getFutureDate(8, 11);
      const blockId = randomUUID();

      // Tenant 1 creates a time block
      const tenant1Block = await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, status, created_at
        ) VALUES ($1, $2, $3, $4, 'Tenant Block', 'blocked', $5, $6, false, 'active', NOW())
        RETURNING id`,
        [blockId, tenant1.id, provider1.id, location1.id, startTime, endTime]
      );

      // Tenant 2 should not see Tenant 1's time block
      const tenant2Query = await pool.query(
        `SELECT id FROM time_blocks
         WHERE tenant_id = $1 AND id = $2`,
        [tenant2.id, tenant1Block.rows[0].id]
      );

      expect(tenant2Query.rows.length).toBe(0);

      // Tenant 2's conflict check should not see Tenant 1's blocks
      const tenant2Conflict = await hasSchedulingConflict(
        tenant2.id,
        provider2.id,
        startTime,
        endTime
      );

      expect(tenant2Conflict.hasConflict).toBe(false);
    });

    it('should only expand time blocks for the correct tenant', async () => {
      const startTime = getFutureDate(9, 9);
      const endTime = getFutureDate(9, 10);
      const blockId = randomUUID();

      const pattern = {
        pattern: 'weekly',
        days: [1, 3, 5],
        until: getFutureDate(30),
      };

      // Create recurring block for tenant 1
      await pool.query(
        `INSERT INTO time_blocks (
          id, tenant_id, provider_id, location_id, title, block_type,
          start_time, end_time, is_recurring, recurrence_pattern, recurrence_end_date,
          status, created_at
        ) VALUES ($1, $2, $3, $4, 'Tenant Recurring Block', 'blocked', $5, $6, true, $7, $8, 'active', NOW())`,
        [
          blockId,
          tenant1.id,
          provider1.id,
          location1.id,
          startTime,
          endTime,
          JSON.stringify(pattern),
          pattern.until,
        ]
      );

      const rangeStart = new Date(startTime);
      const rangeEnd = new Date(pattern.until);

      // Tenant 1 should see expanded blocks
      const tenant1Expanded = await getExpandedTimeBlocks(
        tenant1.id,
        provider1.id,
        null,
        rangeStart,
        rangeEnd
      );

      expect(tenant1Expanded.length).toBeGreaterThan(0);

      // Tenant 2 should not see any blocks
      const tenant2Expanded = await getExpandedTimeBlocks(
        tenant2.id,
        provider2.id,
        null,
        rangeStart,
        rangeEnd
      );

      expect(tenant2Expanded.length).toBe(0);
    });
  });
});
