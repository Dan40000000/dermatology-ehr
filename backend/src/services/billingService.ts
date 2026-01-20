import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

export interface Claim {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  claimNumber?: string;
  totalCents: number;
  status: string;
  payer?: string;
  payerId?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimLineItem {
  id: string;
  claimId: string;
  chargeId: string;
  cptCode: string;
  description: string;
  diagnosisCodes: string[];
  quantity: number;
  amountCents: number;
}

export class BillingService {
  /**
   * Create a claim from encounter charges
   */
  async createClaimFromCharges(
    tenantId: string,
    encounterId: string,
    userId: string
  ): Promise<Claim> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get encounter details
      const encounterResult = await client.query(
        `SELECT e.id, e.patient_id, e.provider_id,
                p.insurance_details
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        throw new Error('Encounter not found');
      }

      const encounter = encounterResult.rows[0];
      const insuranceDetails = encounter.insurance_details;

      // Get primary insurance info
      let payer: string | undefined;
      let payerId: string | undefined;

      if (insuranceDetails && insuranceDetails.primary) {
        payer = insuranceDetails.primary.planName;
        payerId = insuranceDetails.primary.payerId;
      }

      // Check if claim already exists for this encounter
      const existingClaimResult = await client.query(
        `SELECT id FROM claims WHERE encounter_id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (existingClaimResult.rowCount && existingClaimResult.rowCount > 0) {
        // Return existing claim
        const claimResult = await client.query(
          `SELECT * FROM claims WHERE id = $1`,
          [existingClaimResult.rows[0].id]
        );
        await client.query('COMMIT');
        return this.mapClaim(claimResult.rows[0]);
      }

      // Get all pending/ready charges for this encounter
      const chargesResult = await client.query(
        `SELECT id, cpt_code, description, quantity, fee_cents, icd_codes
         FROM charges
         WHERE encounter_id = $1 AND tenant_id = $2
           AND status IN ('pending', 'ready')
           AND fee_cents IS NOT NULL`,
        [encounterId, tenantId]
      );

      if (!chargesResult.rowCount) {
        throw new Error('No charges found for encounter');
      }

      const charges = chargesResult.rows;
      const totalCents = charges.reduce(
        (sum, charge) => sum + (charge.fee_cents * (charge.quantity || 1)),
        0
      );

      // Generate claim number
      const claimNumber = await this.generateClaimNumber(tenantId);

      // Create claim
      const claimId = crypto.randomUUID();
      const claimResult = await client.query(
        `INSERT INTO claims (
          id, tenant_id, encounter_id, patient_id, claim_number,
          total_cents, status, payer, payer_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *`,
        [
          claimId,
          tenantId,
          encounterId,
          encounter.patient_id,
          claimNumber,
          totalCents,
          'draft',
          payer || null,
          payerId || null,
        ]
      );

      // Create claim line items
      for (const charge of charges) {
        const lineItemId = crypto.randomUUID();
        await client.query(
          `INSERT INTO claim_line_items (
            id, claim_id, charge_id, cpt_code, description,
            diagnosis_codes, quantity, amount_cents, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            lineItemId,
            claimId,
            charge.id,
            charge.cpt_code,
            charge.description,
            charge.icd_codes || [],
            charge.quantity || 1,
            charge.fee_cents,
          ]
        );

        // Update charge status
        await client.query(
          `UPDATE charges SET status = 'claimed' WHERE id = $1`,
          [charge.id]
        );
      }

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [crypto.randomUUID(), tenantId, userId, 'claim_created', 'claim', claimId]
      );

      await client.query('COMMIT');
      logger.info(`Created claim ${claimNumber} for encounter ${encounterId}`);
      return this.mapClaim(claimResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating claim from charges:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Submit a claim for processing
   */
  async submitClaim(
    tenantId: string,
    claimId: string,
    userId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validate claim is ready for submission
      const claimResult = await client.query(
        `SELECT id, status, payer, payer_id
         FROM claims
         WHERE id = $1 AND tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        throw new Error('Claim not found');
      }

      const claim = claimResult.rows[0];

      if (claim.status !== 'draft' && claim.status !== 'ready') {
        throw new Error(`Claim is not ready for submission (status: ${claim.status})`);
      }

      if (!claim.payer) {
        throw new Error('Claim missing payer information');
      }

      // Update claim status
      await client.query(
        `UPDATE claims
         SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [claimId, tenantId]
      );

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [crypto.randomUUID(), tenantId, userId, 'claim_submitted', 'claim', claimId]
      );

      await client.query('COMMIT');
      logger.info(`Submitted claim ${claimId} for processing`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error submitting claim:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get claim with line items
   */
  async getClaimDetails(
    tenantId: string,
    claimId: string
  ): Promise<any> {
    try {
      const claimResult = await pool.query(
        `SELECT c.*,
                p.first_name, p.last_name, p.dob,
                p.insurance_details,
                e.id as encounter_id
         FROM claims c
         JOIN patients p ON p.id = c.patient_id
         LEFT JOIN encounters e ON e.id = c.encounter_id
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [claimId, tenantId]
      );

      if (!claimResult.rowCount) {
        return null;
      }

      const claim = claimResult.rows[0];

      // Get line items
      const lineItemsResult = await pool.query(
        `SELECT id, charge_id, cpt_code, description, diagnosis_codes,
                quantity, amount_cents, created_at
         FROM claim_line_items
         WHERE claim_id = $1
         ORDER BY created_at`,
        [claimId]
      );

      return {
        ...claim,
        lineItems: lineItemsResult.rows,
      };
    } catch (error) {
      logger.error('Error getting claim details:', error);
      throw error;
    }
  }

  /**
   * Get claims for an encounter
   */
  async getClaimsByEncounter(
    tenantId: string,
    encounterId: string
  ): Promise<Claim[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM claims
         WHERE encounter_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC`,
        [encounterId, tenantId]
      );

      return result.rows.map(row => this.mapClaim(row));
    } catch (error) {
      logger.error('Error getting claims by encounter:', error);
      throw error;
    }
  }

  /**
   * Update claim status
   */
  async updateClaimStatus(
    tenantId: string,
    claimId: string,
    status: string,
    userId: string
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE claims
         SET status = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [status, claimId, tenantId]
      );

      // Log audit event
      await pool.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [crypto.randomUUID(), tenantId, userId, `claim_status_${status}`, 'claim', claimId]
      );

      logger.info(`Updated claim ${claimId} status to ${status}`);
    } catch (error) {
      logger.error('Error updating claim status:', error);
      throw error;
    }
  }

  /**
   * Generate unique claim number
   */
  private async generateClaimNumber(tenantId: string): Promise<string> {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM claims
       WHERE tenant_id = $1
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())`,
      [tenantId]
    );

    const count = parseInt(result.rows[0].count) + 1;
    const year = new Date().getFullYear();
    return `CLM-${year}-${String(count).padStart(6, '0')}`;
  }

  private mapClaim(row: any): Claim {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      claimNumber: row.claim_number,
      totalCents: row.total_cents,
      status: row.status,
      payer: row.payer,
      payerId: row.payer_id,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const billingService = new BillingService();
