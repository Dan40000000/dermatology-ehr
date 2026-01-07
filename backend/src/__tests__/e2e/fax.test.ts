/**
 * E2E Integration Tests: Fax Flow
 * Tests the complete fax workflow including sending, receiving, and status updates
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { pool } from '../../db/pool';
import {
  createTestTenant,
  createTestUser,
  createTestProvider,
  createTestPatient,
  cleanupTestTenant,
  waitForCondition,
  TestTenant,
  TestUser,
  TestProvider,
  TestPatient,
} from '../helpers/testHelpers';
import { faxAdapter, MockFaxAdapter } from '../../services/faxAdapter';
import { randomUUID } from 'crypto';

const describeIf = process.env.RUN_E2E === 'true' ? describe : describe.skip;

describeIf('E2E: Fax Flow', () => {
  let tenant1: TestTenant;
  let tenant2: TestTenant;
  let user1: TestUser;
  let provider1: TestProvider;
  let patient1: TestPatient;
  let patient2: TestPatient;

  beforeAll(async () => {
    // Create tenants
    tenant1 = await createTestTenant('Tenant 1 - Fax');
    tenant2 = await createTestTenant('Tenant 2 - Fax');

    // Create users
    user1 = await createTestUser(tenant1.id, 'admin');

    // Create providers
    provider1 = await createTestProvider(tenant1.id);

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

  describe('1. Send Outbound Fax to Mock Adapter', () => {
    it('should send a fax through mock adapter', async () => {
      const faxId = randomUUID();
      const toNumber = '+15555551234';
      const fromNumber = '+15555550000';
      const subject = 'Test Fax - Medical Records';

      // Create outbound fax record
      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, patient_id, sent_by,
          to_number, from_number, subject, pages,
          status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [faxId, tenant1.id, patient1.id, user1.id, toNumber, fromNumber, subject, 3, 'queued']
      );

      // Send via adapter
      const sendResult = await faxAdapter.sendFax({
        to: toNumber,
        from: fromNumber,
        subject,
        documentId: faxId,
        pages: 3,
        metadata: {
          tenantId: tenant1.id,
          patientId: patient1.id,
        },
      });

      expect(sendResult.transmissionId).toBeDefined();
      expect(['queued', 'sent', 'failed']).toContain(sendResult.status);
      expect(sendResult.timestamp).toBeDefined();

      // Update database with transmission result
      await pool.query(
        `UPDATE faxes
         SET transmission_id = $1,
             status = $2,
             sent_at = $3,
             error_message = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          sendResult.transmissionId,
          sendResult.status,
          sendResult.status === 'sent' ? new Date().toISOString() : null,
          sendResult.errorMessage || null,
          faxId,
        ]
      );

      const result = await pool.query(
        `SELECT transmission_id, status, sent_at FROM faxes WHERE id = $1`,
        [faxId]
      );

      expect(result.rows[0].transmission_id).toBe(sendResult.transmissionId);
      expect(result.rows[0].status).toBe(sendResult.status);
    });

    it('should handle successful fax transmission', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, patient_id, sent_by, to_number, from_number,
          subject, pages, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [faxId, tenant1.id, patient1.id, user1.id, '+15555559999', '+15555550000', 'Lab Results', 2, 'queued']
      );

      const originalRandom = Math.random;
      Math.random = () => 0.5;
      let sendResult;
      try {
        sendResult = await faxAdapter.sendFax({
          to: '+15555559999',
          from: '+15555550000',
          subject: 'Lab Results',
          documentId: faxId,
          pages: 2,
        });
      } finally {
        Math.random = originalRandom;
      }

      expect(sendResult?.status).toBe('sent');
      expect(sendResult?.errorMessage).toBeUndefined();
    });

    it('should handle failed fax transmission', async () => {
      const originalRandom = Math.random;
      Math.random = () => 0;
      try {
        const result = await faxAdapter.sendFax({
          to: '+15555551111',
          from: '+15555550000',
          subject: 'Test Fax',
          pages: 1,
        });

        expect(result.status).toBe('failed');
        expect(result.errorMessage).toBeDefined();
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should record fax metadata', async () => {
      const faxId = randomUUID();
      const metadata = {
        documentType: 'referral',
        patientName: 'John Doe',
        urgency: 'high',
      };

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, patient_id, sent_by, to_number, from_number,
          subject, pages, metadata, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          faxId,
          tenant1.id,
          patient1.id,
          user1.id,
          '+15555552222',
          '+15555550000',
          'Referral',
          1,
          JSON.stringify(metadata),
          'queued',
        ]
      );

      const result = await pool.query(
        `SELECT metadata FROM faxes WHERE id = $1`,
        [faxId]
      );

      expect(result.rows[0].metadata).toBeDefined();
      expect(result.rows[0].metadata.documentType).toBe('referral');
    });
  });

  describe('2. Verify Fax Status Updates', () => {
    it('should check fax status through adapter', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, patient_id, sent_by, to_number, from_number,
          subject, pages, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [faxId, tenant1.id, patient1.id, user1.id, '+15555553333', '+15555550000', 'Test', 1, 'queued']
      );

      // Send fax
      const sendResult = await faxAdapter.sendFax({
        to: '+15555553333',
        from: '+15555550000',
        subject: 'Test',
        documentId: faxId,
        pages: 1,
      });

      await pool.query(
        `UPDATE faxes
         SET transmission_id = $1, status = $2
         WHERE id = $3`,
        [sendResult.transmissionId, sendResult.status, faxId]
      );

      // Check status
      const statusResult = await faxAdapter.getStatus(sendResult.transmissionId);

      expect(statusResult.transmissionId).toBe(sendResult.transmissionId);
      expect(statusResult.status).toBeDefined();
      expect(['queued', 'sending', 'sent', 'failed']).toContain(statusResult.status);

      // Update database with status
      await pool.query(
        `UPDATE faxes
         SET status = $1, updated_at = NOW()
         WHERE transmission_id = $2`,
        [statusResult.status, statusResult.transmissionId]
      );

      const dbResult = await pool.query(
        `SELECT status FROM faxes WHERE transmission_id = $1`,
        [sendResult.transmissionId]
      );

      expect(dbResult.rows[0].status).toBe(statusResult.status);
    });

    it('should track status check timestamp', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, sent_by, to_number, from_number, subject, pages, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, NOW())`,
        [faxId, tenant1.id, user1.id, '+15555554444', '+15555550000', 'Test', 1, 'queued']
      );

      const sendResult = await faxAdapter.sendFax({
        to: '+15555554444',
        from: '+15555550000',
        subject: 'Test',
        documentId: faxId,
        pages: 1,
      });

      await pool.query(
        `UPDATE faxes
         SET transmission_id = $1, status = $2
         WHERE id = $3`,
        [sendResult.transmissionId, sendResult.status, faxId]
      );

      // Check status
      await faxAdapter.getStatus(sendResult.transmissionId);

      await pool.query(
        `UPDATE faxes
         SET updated_at = NOW()
         WHERE transmission_id = $1`,
        [sendResult.transmissionId]
      );

      const result = await pool.query(
        `SELECT updated_at FROM faxes WHERE transmission_id = $1`,
        [sendResult.transmissionId]
      );

      expect(result.rows[0].updated_at).toBeDefined();
    });

    it('should update status from queued to sent', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, sent_by, to_number, from_number, subject, pages, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, NOW())`,
        [faxId, tenant1.id, user1.id, '+15555555555', '+15555550000', 'Test', 1, 'queued']
      );

      const sendResult = await faxAdapter.sendFax({
        to: '+15555555555',
        from: '+15555550000',
        subject: 'Test',
        documentId: faxId,
        pages: 1,
      });

      if (sendResult.status === 'sent') {
        await pool.query(
          `UPDATE faxes
           SET transmission_id = $1, status = $2, sent_at = NOW()
           WHERE id = $3`,
          [sendResult.transmissionId, sendResult.status, faxId]
        );

        const result = await pool.query(
          `SELECT status, sent_at FROM faxes WHERE id = $1`,
          [faxId]
        );

        expect(result.rows[0].status).toBe('sent');
        expect(result.rows[0].sent_at).toBeDefined();
      }
    });
  });

  describe('3. Simulate Inbound Fax Webhook', () => {
    it('should process inbound fax webhook', async () => {
      const webhookData = {
        transmissionId: `RX-${Date.now()}-TEST`,
        from: '+15555556666',
        to: '+15555550000',
        subject: 'Incoming Lab Results',
        pages: 4,
        receivedAt: new Date().toISOString(),
        documentUrl: '/sample-lab-results.pdf',
        metadata: {
          tenantId: tenant1.id,
        },
      };

      const inboundFax = await faxAdapter.receiveWebhook(webhookData);

      expect(inboundFax.transmissionId).toBeDefined();
      expect(inboundFax.from).toBe('+15555556666');
      expect(inboundFax.to).toBe('+15555550000');
      expect(inboundFax.subject).toBe('Incoming Lab Results');
      expect(inboundFax.pages).toBe(4);
      expect(inboundFax.receivedAt).toBeDefined();

      // Store in inbox
      const faxId = randomUUID();
      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, pdf_url, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9, 'received', false, NOW())`,
        [
          faxId,
          tenant1.id,
          inboundFax.transmissionId,
          inboundFax.from,
          inboundFax.to,
          inboundFax.subject,
          inboundFax.pages,
          inboundFax.receivedAt,
          inboundFax.documentUrl,
        ]
      );

      const result = await pool.query(
        `SELECT id, from_number, subject, pages, status, read FROM faxes WHERE id = $1`,
        [faxId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].status).toBe('received');
      expect(result.rows[0].read).toBe(false);
      expect(result.rows[0].pages).toBe(4);
    });

    it('should generate sample incoming fax', async () => {
      const mockAdapter = faxAdapter as MockFaxAdapter;

      if (mockAdapter.generateSampleIncomingFax) {
        const sampleFax = await mockAdapter.generateSampleIncomingFax(tenant1.id);

        expect(sampleFax.transmissionId).toBeDefined();
        expect(sampleFax.from).toBeDefined();
        expect(sampleFax.to).toBeDefined();
        expect(sampleFax.subject).toBeDefined();
        expect(sampleFax.pages).toBeGreaterThan(0);
        expect(sampleFax.receivedAt).toBeDefined();

        // Store sample in inbox
        const faxId = randomUUID();
        await pool.query(
          `INSERT INTO faxes (
            id, tenant_id, direction, transmission_id, from_number, to_number,
            subject, pages, received_at, pdf_url, status, read, created_at
          ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, $8, $9, 'received', false, NOW())`,
          [
            faxId,
            tenant1.id,
            sampleFax.transmissionId,
            sampleFax.from,
            sampleFax.to,
            sampleFax.subject,
            sampleFax.pages,
            sampleFax.receivedAt,
            sampleFax.documentUrl,
          ]
        );

        const result = await pool.query(
          `SELECT id FROM faxes WHERE id = $1`,
          [faxId]
        );

        expect(result.rows.length).toBe(1);
      }
    });

    it('should handle webhook with minimal data', async () => {
      const minimalWebhook = {
        from: '+15555557777',
      };

      const inboundFax = await faxAdapter.receiveWebhook(minimalWebhook);

      expect(inboundFax.transmissionId).toBeDefined();
      expect(inboundFax.from).toBe('+15555557777');
      expect(inboundFax.to).toBeDefined();
      expect(inboundFax.pages).toBeGreaterThan(0);
    });
  });

  describe('4. Verify Fax Appears in Inbox', () => {
    it('should list faxes in inbox', async () => {
      // Create multiple faxes in inbox
      const fax1Id = randomUUID();
      const fax2Id = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES
          ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), $8, false, NOW()),
          ($9, $10, 'inbound', $11, $12, $13, $14, $15, NOW(), $16, false, NOW())`,
        [
          fax1Id,
          tenant1.id,
          'RX-001',
          '+15555558888',
          '+15555550000',
          'Referral',
          2,
          'received',
          fax2Id,
          tenant1.id,
          'RX-002',
          '+15555559999',
          '+15555550000',
          'Lab Results',
          3,
          'received',
        ]
      );

      const result = await pool.query(
        `SELECT id, subject, from_number, pages, status, read
         FROM faxes
         WHERE tenant_id = $1 AND direction = 'inbound'
         ORDER BY received_at DESC`,
        [tenant1.id]
      );

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      expect(result.rows.every(row => row.read === false)).toBe(true);
    });

    it('should mark fax as read', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), 'received', false, NOW())`,
        [faxId, tenant1.id, 'RX-003', '+15555551111', '+15555550000', 'Insurance', 1]
      );

      // Mark as read
      await pool.query(
        `UPDATE faxes
         SET read = true, assigned_to = $1, updated_at = NOW()
         WHERE id = $2`,
        [user1.id, faxId]
      );

      const result = await pool.query(
        `SELECT read, assigned_to FROM faxes WHERE id = $1`,
        [faxId]
      );

      expect(result.rows[0].read).toBe(true);
      expect(result.rows[0].assigned_to).toBe(user1.id);
    });

    it('should filter inbox by status', async () => {
      const unreadFaxId = randomUUID();
      const readFaxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES
          ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), $8, false, NOW()),
          ($9, $10, 'inbound', $11, $12, $13, $14, $15, NOW(), $16, true, NOW())`,
        [
          unreadFaxId,
          tenant1.id,
          'RX-004',
          '+15555552222',
          '+15555550000',
          'Unread Fax',
          1,
          'received',
          readFaxId,
          tenant1.id,
          'RX-005',
          '+15555553333',
          '+15555550000',
          'Read Fax',
          1,
          'received',
        ]
      );

      const unreadResult = await pool.query(
        `SELECT id FROM faxes WHERE tenant_id = $1 AND direction = 'inbound' AND read = false`,
        [tenant1.id]
      );

      const readResult = await pool.query(
        `SELECT id FROM faxes WHERE tenant_id = $1 AND direction = 'inbound' AND read = true`,
        [tenant1.id]
      );

      expect(unreadResult.rows.some(row => row.id === unreadFaxId)).toBe(true);
      expect(readResult.rows.some(row => row.id === readFaxId)).toBe(true);
    });

    it('should associate fax with patient', async () => {
      const faxId = randomUUID();

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, patient_id, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), $8, 'received', false, NOW())`,
        [
          faxId,
          tenant1.id,
          'RX-006',
          '+15555554444',
          '+15555550000',
          'Patient Records',
          2,
          patient1.id,
        ]
      );

      const result = await pool.query(
        `SELECT f.id, f.subject, p.first_name, p.last_name
         FROM faxes f
         LEFT JOIN patients p ON f.patient_id = p.id
         WHERE f.id = $1`,
        [faxId]
      );

      expect(result.rows[0].first_name).toBe(patient1.firstName);
      expect(result.rows[0].last_name).toBe(patient1.lastName);
    });
  });

  describe('5. Tenant Isolation', () => {
    it('should not allow cross-tenant access to outbound faxes', async () => {
      const faxId = randomUUID();

      // Create fax for tenant 1
      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, sent_by, to_number, from_number, subject, pages, status, created_at
        ) VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8, NOW())`,
        [faxId, tenant1.id, user1.id, '+15555555555', '+15555550000', 'Tenant 1 Fax', 1, 'sent']
      );

      // Tenant 2 should not see tenant 1's fax
      const result = await pool.query(
        `SELECT id FROM faxes WHERE id = $1 AND tenant_id = $2`,
        [faxId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });

    it('should not allow cross-tenant access to inbound faxes', async () => {
      const faxId = randomUUID();

      // Create fax for tenant 1
      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), 'received', false, NOW())`,
        [faxId, tenant1.id, 'RX-007', '+15555556666', '+15555550000', 'Tenant 1 Incoming', 1]
      );

      // Tenant 2 should not see tenant 1's fax
      const result = await pool.query(
        `SELECT id FROM faxes WHERE id = $1 AND tenant_id = $2`,
        [faxId, tenant2.id]
      );

      expect(result.rows.length).toBe(0);
    });

    it('should isolate fax inbox by tenant', async () => {
      const tenant1FaxId = randomUUID();
      const tenant2FaxId = randomUUID();

      // Create fax for each tenant
      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), 'received', false, NOW())`,
        [
          tenant1FaxId,
          tenant1.id,
          'RX-T1',
          '+15555551111',
          '+15555550000',
          'Tenant 1 Fax',
          1,
        ]
      );

      await pool.query(
        `INSERT INTO faxes (
          id, tenant_id, direction, transmission_id, from_number, to_number,
          subject, pages, received_at, status, read, created_at
        ) VALUES ($1, $2, 'inbound', $3, $4, $5, $6, $7, NOW(), 'received', false, NOW())`,
        [
          tenant2FaxId,
          tenant2.id,
          'RX-T2',
          '+15555552222',
          '+15555550000',
          'Tenant 2 Fax',
          1,
        ]
      );

      // Tenant 1 should only see their fax
      const tenant1Result = await pool.query(
        `SELECT id, subject FROM faxes WHERE tenant_id = $1 AND direction = 'inbound'`,
        [tenant1.id]
      );

      // Tenant 2 should only see their fax
      const tenant2Result = await pool.query(
        `SELECT id, subject FROM faxes WHERE tenant_id = $1 AND direction = 'inbound'`,
        [tenant2.id]
      );

      expect(tenant1Result.rows.every(row => row.subject !== 'Tenant 2 Fax')).toBe(true);
      expect(tenant2Result.rows.every(row => row.subject !== 'Tenant 1 Fax')).toBe(true);
    });
  });
});
