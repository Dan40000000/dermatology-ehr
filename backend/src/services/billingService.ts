import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { ensureEncounterBill, normalizeEncounterCharges } from './encounterFinancialsService';
import { scrubClaim, type ClaimForScrubbing, type ScrubResult } from './claimScrubber';
import type { PoolClient } from 'pg';

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
  diagnosisPointers?: string[];
  quantity: number;
  amountCents: number;
}

const DIAGNOSIS_POINTER_LABELS = 'ABCDEFGHIJKL'.split('');

function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function parseInsuranceDetails(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value : null;
}

function normalizeIcdCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((code) => String(code || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((code) => code.trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }

  return [];
}

function getChargeAmountCents(charge: { amount_cents?: number | null; fee_cents?: number | null; quantity?: number | null }): number {
  const quantity = Number(charge.quantity || 1);
  return Number(charge.amount_cents ?? ((charge.fee_cents || 0) * quantity));
}

function normalizeClaimLineItemsForScrubbing(value: unknown): ClaimForScrubbing['lineItems'] {
  let rawItems: unknown = [];
  if (Array.isArray(value)) {
    rawItems = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      rawItems = JSON.parse(value);
    } catch {
      rawItems = [];
    }
  }

  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item: any) => ({
    cpt: String(item.cpt || item.cptCode || item.cpt_code || '').trim().toUpperCase(),
    modifiers: Array.isArray(item.modifiers)
      ? item.modifiers
      : Array.isArray(item.modifierCodes)
        ? item.modifierCodes
        : [],
    dx: Array.isArray(item.dx)
      ? item.dx
      : Array.isArray(item.diagnosisCodes)
        ? item.diagnosisCodes
        : Array.isArray(item.icdCodes)
          ? item.icdCodes
          : [],
    diagnosisPointers: Array.isArray(item.diagnosisPointers) ? item.diagnosisPointers : [],
    units: Number(item.units || item.quantity || 1),
    charge: Number(item.charge ?? (Number(item.amountCents || item.amount_cents || 0) / 100)),
    description: item.description,
    codeType: item.codeType || item.code_type,
    billingRoute: item.billingRoute || item.billing_route,
  }));
}

async function loadClaimForSubmissionScrub(
  client: PoolClient,
  tenantId: string,
  claimId: string,
): Promise<ClaimForScrubbing | null> {
  const claimResult = await client.query(
    `SELECT
       c.id,
       c.tenant_id,
       c.patient_id,
       c.service_date,
       c.line_items,
       c.payer_id,
       c.payer_name,
       c.payer,
       c.is_cosmetic,
       p.first_name as patient_first_name,
       p.last_name as patient_last_name,
       p.dob as patient_dob,
       p.address as patient_address,
       p.city as patient_city,
       p.state as patient_state,
       p.zip as patient_zip,
       p.insurance_member_id,
       e.provider_id,
       pr.full_name as provider_name,
       pr.npi as provider_npi,
       NULLIF(to_jsonb(e)->>'place_of_service', '') as place_of_service
     FROM claims c
     JOIN patients p ON p.id = c.patient_id AND p.tenant_id = c.tenant_id
     LEFT JOIN encounters e ON e.id = c.encounter_id AND e.tenant_id = c.tenant_id
     LEFT JOIN providers pr ON pr.id = e.provider_id AND pr.tenant_id = c.tenant_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [claimId, tenantId],
  );

  if (!claimResult.rowCount) return null;
  const row = claimResult.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    serviceDate: row.service_date,
    lineItems: normalizeClaimLineItemsForScrubbing(row.line_items),
    payerId: row.payer_id,
    payerName: row.payer_name || row.payer,
    isCosmetic: row.is_cosmetic,
    patient: {
      firstName: row.patient_first_name,
      lastName: row.patient_last_name,
      dob: row.patient_dob,
      address: row.patient_address,
      city: row.patient_city,
      state: row.patient_state,
      zip: row.patient_zip,
      insuranceMemberId: row.insurance_member_id,
    },
    provider: {
      id: row.provider_id,
      name: row.provider_name,
      npi: row.provider_npi,
    },
    placeOfService: row.place_of_service,
  };
}

async function persistSubmissionScrubResult(
  client: PoolClient,
  tenantId: string,
  claimId: string,
  scrubResult: ScrubResult,
): Promise<void> {
  await client.query(
    `UPDATE claims
     SET scrub_status = $1,
         scrub_errors = $2,
         scrub_warnings = $3,
         scrub_info = $4,
         last_scrubbed_at = NOW(),
         updated_at = NOW()
     WHERE id = $5 AND tenant_id = $6`,
    [
      scrubResult.status,
      JSON.stringify(scrubResult.errors),
      JSON.stringify(scrubResult.warnings),
      JSON.stringify(scrubResult.info),
      claimId,
      tenantId,
    ],
  );
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
                p.insurance_details,
                p.insurance_plan_name,
                p.insurance_payer_id,
                p.insurance as insurance_fallback
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        throw new Error('Encounter not found');
      }

      const encounter = encounterResult.rows[0];
      const insuranceDetails = parseInsuranceDetails(encounter.insurance_details);

      // Get primary insurance info
      let payer: string | undefined;
      let payerId: string | undefined;

      if (insuranceDetails && insuranceDetails.primary) {
        payer = firstNonEmpty(
          insuranceDetails.primary.planName,
          insuranceDetails.primary.plan_name,
          insuranceDetails.primary.payerName,
          insuranceDetails.primary.payer_name,
          insuranceDetails.primary.name
        );
        payerId = firstNonEmpty(
          insuranceDetails.primary.payerId,
          insuranceDetails.primary.payer_id,
          insuranceDetails.primary.id
        );
      }

      payer = firstNonEmpty(payer, encounter.insurance_plan_name, encounter.insurance_fallback);
      payerId = firstNonEmpty(payerId, encounter.insurance_payer_id);

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
        await ensureEncounterBill(tenantId, encounterId, userId, client, existingClaimResult.rows[0].id);
        await client.query('COMMIT');
        return this.mapClaim(claimResult.rows[0]);
      }

      await normalizeEncounterCharges(tenantId, encounterId, client);

      // Get all pending/ready insurance-routed charges for this encounter
      const chargesResult = await client.query(
        `SELECT id, cpt_code, description, quantity, fee_cents, amount_cents,
                icd_codes, service_date, coalesce(modifier_codes, array[]::text[]) as modifier_codes
         FROM charges
         WHERE encounter_id = $1 AND tenant_id = $2
           AND status IN ('pending', 'ready')
           AND coalesce(nullif(to_jsonb(charges)->>'billing_route', ''), 'insurance') = 'insurance'
           AND COALESCE(amount_cents, fee_cents * COALESCE(quantity, 1)) IS NOT NULL`,
        [encounterId, tenantId]
      );

      if (!chargesResult.rowCount) {
        throw new Error('No charges found for encounter');
      }

      const charges = chargesResult.rows;
      const chargesMissingDiagnosis = charges.filter((charge) => normalizeIcdCodes(charge.icd_codes).length === 0);
      if (chargesMissingDiagnosis.length > 0) {
        const missingCodeList = chargesMissingDiagnosis
          .map((charge) => `${charge.cpt_code}${charge.description ? ` (${charge.description})` : ''}`)
          .join(', ');
        throw new Error(`Cannot create insurance claim. Diagnosis code is required for: ${missingCodeList}`);
      }

      const claimDiagnosisCodes = Array.from(
        new Set(charges.flatMap((charge) => normalizeIcdCodes(charge.icd_codes)))
      );
      if (claimDiagnosisCodes.length > DIAGNOSIS_POINTER_LABELS.length) {
        throw new Error('Cannot create insurance claim with more than 12 diagnosis codes. Split the claim or reduce line-level diagnoses.');
      }
      const diagnosisPointerByCode = new Map(
        claimDiagnosisCodes.map((code, index) => [code, index])
      );

      const totalCents = charges.reduce(
        (sum, charge) => sum + getChargeAmountCents(charge),
        0
      );
      const lineItems = charges.map((charge) => {
        const dx = normalizeIcdCodes(charge.icd_codes);
        const diagnosisPointers = dx.map((code) => {
          const index = diagnosisPointerByCode.get(code);
          return typeof index === 'number' ? index + 1 : null;
        }).filter((pointer): pointer is number => pointer != null);

        return {
          cpt: charge.cpt_code,
          modifiers: charge.modifier_codes || [],
          dx,
          diagnosisPointers,
          diagnosisPointerLabels: diagnosisPointers.map((pointer) => DIAGNOSIS_POINTER_LABELS[pointer - 1]),
          units: charge.quantity || 1,
          charge: getChargeAmountCents(charge) / 100,
          description: charge.description,
        };
      });
      const serviceDate = charges[0]?.service_date || new Date().toISOString().split('T')[0];

      // Generate claim number
      const claimNumber = await this.generateClaimNumber(tenantId);

      // Create claim
      const claimId = crypto.randomUUID();
      const claimResult = await client.query(
        `INSERT INTO claims (
          id, tenant_id, encounter_id, patient_id, claim_number,
          total_cents, total_charges, status, payer, payer_id, payer_name,
          service_date, line_items, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        RETURNING *`,
        [
          claimId,
          tenantId,
          encounterId,
          encounter.patient_id,
          claimNumber,
          totalCents,
          totalCents / 100,
          'coding_review',
          payer || null,
          payerId || null,
          payer || null,
          serviceDate,
          JSON.stringify(lineItems),
          userId,
        ]
      );

      // Create claim line items
      for (const charge of charges) {
        const lineItemId = crypto.randomUUID();
        await client.query(
          `INSERT INTO claim_line_items (
            id, claim_id, charge_id, cpt_code, description,
            diagnosis_codes, diagnosis_pointers, quantity, amount_cents, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            lineItemId,
            claimId,
            charge.id,
            charge.cpt_code,
            charge.description,
            normalizeIcdCodes(charge.icd_codes),
            normalizeIcdCodes(charge.icd_codes).map((code) => {
              const index = diagnosisPointerByCode.get(code);
              return typeof index === 'number' ? DIAGNOSIS_POINTER_LABELS[index] : null;
            }).filter((pointer): pointer is string => pointer != null),
            charge.quantity || 1,
            getChargeAmountCents(charge),
          ]
        );

        // Update charge status
        await client.query(
          `UPDATE charges SET status = 'claimed' WHERE id = $1`,
          [charge.id]
        );
      }

      await ensureEncounterBill(tenantId, encounterId, userId, client, claimId);

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, user_id, action, resource_type, resource_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          crypto.randomUUID(),
          tenantId,
          userId,
          'claim_created_for_coding_review',
          'claim',
          claimId,
          JSON.stringify({ encounterId, claimNumber, nextStep: 'coding_review' }),
        ]
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

      if (claim.status !== 'ready') {
        throw new Error(`Claim must be released from coding review before submission (status: ${claim.status})`);
      }

      if (!claim.payer) {
        throw new Error('Claim missing payer information');
      }

      const scrubTarget = await loadClaimForSubmissionScrub(client, tenantId, claimId);
      if (!scrubTarget) {
        throw new Error('Claim not found');
      }

      const scrubResult = await scrubClaim(scrubTarget);
      await persistSubmissionScrubResult(client, tenantId, claimId, scrubResult);
      if (!scrubResult.canSubmit) {
        throw new Error('Claim has unresolved readiness errors');
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
        `SELECT id, charge_id, cpt_code, description, diagnosis_codes, diagnosis_pointers,
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
      if (status === 'ready' || status === 'submitted') {
        throw new Error('Use the claim release/submission workflow for ready or submitted status changes');
      }

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
      totalCents: row.total_cents ?? Math.round(Number(row.total_charges || 0) * 100),
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
