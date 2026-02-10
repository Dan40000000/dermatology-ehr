import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';

export interface Superbill {
  id: string;
  tenantId: string;
  encounterId: string;
  patientId: string;
  providerId: string;
  serviceDate: string;
  placeOfService: string;
  status: SuperbillStatus;
  totalCharges: number;
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string;
  finalizedBy?: string;
  notes?: string;
}

export interface SuperbillLineItem {
  id: string;
  tenantId: string;
  superbillId: string;
  cptCode: string;
  description?: string;
  icd10Codes: string[];
  units: number;
  fee: number;
  modifier?: string;
  modifier2?: string;
  modifier3?: string;
  modifier4?: string;
  lineTotal: number;
  lineSequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeeScheduleEntry {
  id: string;
  tenantId: string;
  name: string;
  effectiveDate: string;
  expirationDate?: string;
  isDefault: boolean;
  cptCode: string;
  description?: string;
  defaultFee: number;
  payerSpecificFees: Record<string, { fee: number; notes?: string }>;
}

export interface CommonDermCode {
  id: string;
  tenantId?: string;
  codeType: 'CPT' | 'ICD10';
  code: string;
  description: string;
  category?: string;
  subcategory?: string;
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt?: string;
  displayOrder: number;
}

export type SuperbillStatus = 'draft' | 'pending_review' | 'approved' | 'finalized' | 'submitted' | 'void';

export interface GenerateSuperbillOptions {
  encounterId: string;
  tenantId: string;
  userId: string;
  serviceDate?: string;
}

export interface AddLineItemOptions {
  superbillId: string;
  tenantId: string;
  cptCode: string;
  icd10Codes?: string[];
  units?: number;
  fee?: number;
  modifier?: string;
  description?: string;
}

export class SuperbillService {
  /**
   * Generate a superbill from an encounter
   * Auto-populates with diagnoses and procedures from the encounter
   */
  async generateFromEncounter(options: GenerateSuperbillOptions): Promise<Superbill> {
    const { encounterId, tenantId, userId, serviceDate } = options;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get encounter details
      const encounterResult = await client.query(
        `SELECT e.id, e.patient_id, e.provider_id, e.created_at,
                a.scheduled_start
         FROM encounters e
         LEFT JOIN appointments a ON a.id = e.appointment_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        throw new Error('Encounter not found');
      }

      const encounter = encounterResult.rows[0];
      const effectiveServiceDate = serviceDate ||
        (encounter.scheduled_start ? new Date(encounter.scheduled_start).toISOString().split('T')[0] : null) ||
        new Date(encounter.created_at).toISOString().split('T')[0];

      // Check if superbill already exists for this encounter
      const existingResult = await client.query(
        `SELECT id FROM superbills WHERE encounter_id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (existingResult.rowCount && existingResult.rowCount > 0) {
        // Return existing superbill
        const superbill = await this.getSuperbillById(tenantId, existingResult.rows[0]!.id);
        await client.query('COMMIT');
        if (!superbill) {
          throw new Error('Failed to retrieve existing superbill');
        }
        return superbill;
      }

      // Create superbill
      const superbillId = crypto.randomUUID();
      const superbillResult = await client.query(
        `INSERT INTO superbills (
          id, tenant_id, encounter_id, patient_id, provider_id,
          service_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          superbillId,
          tenantId,
          encounterId,
          encounter.patient_id,
          encounter.provider_id,
          effectiveServiceDate,
          'draft',
          userId,
        ]
      );

      // Get existing charges from the encounter
      const chargesResult = await client.query(
        `SELECT c.id, c.cpt_code, c.description, c.icd_codes, c.quantity, c.fee_cents
         FROM charges c
         WHERE c.encounter_id = $1 AND c.tenant_id = $2`,
        [encounterId, tenantId]
      );

      // Get diagnoses from the encounter
      const diagnosesResult = await client.query(
        `SELECT d.id, d.icd10_code, d.description, d.is_primary
         FROM diagnoses d
         WHERE d.encounter_id = $1 AND d.tenant_id = $2
         ORDER BY d.is_primary DESC, d.created_at`,
        [encounterId, tenantId]
      );

      const diagnoses = diagnosesResult.rows;
      const diagnosisCodes = diagnoses.map((d: { icd10_code: string }) => d.icd10_code);

      // Add line items from existing charges
      let lineSequence = 0;
      for (const charge of chargesResult.rows) {
        const lineItemId = crypto.randomUUID();
        const fee = await this.getFeeForCpt(tenantId, charge.cpt_code);

        await client.query(
          `INSERT INTO superbill_line_items (
            id, tenant_id, superbill_id, cpt_code, description,
            icd10_codes, units, fee, line_sequence
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lineItemId,
            tenantId,
            superbillId,
            charge.cpt_code,
            charge.description,
            charge.icd_codes || diagnosisCodes,
            charge.quantity || 1,
            charge.fee_cents || fee,
            lineSequence++,
          ]
        );
      }

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [crypto.randomUUID(), tenantId, userId, 'superbill_created', 'superbill', superbillId]
      );

      await client.query('COMMIT');
      logger.info(`Created superbill ${superbillId} for encounter ${encounterId}`);

      return this.mapSuperbill(superbillResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error generating superbill from encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a line item to a superbill
   */
  async addLineItem(options: AddLineItemOptions): Promise<SuperbillLineItem> {
    const { superbillId, tenantId, cptCode, icd10Codes, units, fee, modifier, description } = options;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify superbill exists and is not finalized
      const superbillResult = await client.query(
        `SELECT id, status FROM superbills WHERE id = $1 AND tenant_id = $2`,
        [superbillId, tenantId]
      );

      if (!superbillResult.rowCount) {
        throw new Error('Superbill not found');
      }

      const superbill = superbillResult.rows[0];
      if (superbill.status === 'finalized' || superbill.status === 'submitted') {
        throw new Error('Cannot modify a finalized or submitted superbill');
      }

      // Get the next line sequence
      const seqResult = await client.query(
        `SELECT COALESCE(MAX(line_sequence), -1) + 1 as next_seq
         FROM superbill_line_items WHERE superbill_id = $1`,
        [superbillId]
      );
      const nextSeq = seqResult.rows[0]?.next_seq ?? 0;

      // Get fee from fee schedule if not provided
      const effectiveFee = fee ?? await this.getFeeForCpt(tenantId, cptCode);

      // Get description from CPT code if not provided
      let effectiveDescription = description;
      if (!effectiveDescription) {
        const cptResult = await client.query(
          `SELECT description FROM cpt_codes WHERE code = $1 LIMIT 1`,
          [cptCode]
        );
        if (cptResult.rowCount && cptResult.rowCount > 0) {
          effectiveDescription = cptResult.rows[0]!.description;
        }
      }

      // Insert line item
      const lineItemId = crypto.randomUUID();
      const result = await client.query(
        `INSERT INTO superbill_line_items (
          id, tenant_id, superbill_id, cpt_code, description,
          icd10_codes, units, fee, modifier, line_sequence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          lineItemId,
          tenantId,
          superbillId,
          cptCode,
          effectiveDescription || null,
          icd10Codes || [],
          units || 1,
          effectiveFee,
          modifier || null,
          nextSeq,
        ]
      );

      // Track code usage
      await client.query(
        `SELECT increment_code_usage($1, 'CPT', $2)`,
        [tenantId, cptCode]
      );

      await client.query('COMMIT');
      return this.mapLineItem(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding line item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a line item
   */
  async updateLineItem(
    tenantId: string,
    lineItemId: string,
    updates: Partial<{
      cptCode: string;
      description: string;
      icd10Codes: string[];
      units: number;
      fee: number;
      modifier: string;
    }>
  ): Promise<SuperbillLineItem> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify line item exists and superbill is not finalized
      const lineItemResult = await client.query(
        `SELECT li.*, s.status as superbill_status
         FROM superbill_line_items li
         JOIN superbills s ON s.id = li.superbill_id
         WHERE li.id = $1 AND li.tenant_id = $2`,
        [lineItemId, tenantId]
      );

      if (!lineItemResult.rowCount) {
        throw new Error('Line item not found');
      }

      const lineItem = lineItemResult.rows[0];
      if (lineItem.superbill_status === 'finalized' || lineItem.superbill_status === 'submitted') {
        throw new Error('Cannot modify line items on a finalized or submitted superbill');
      }

      const updateFields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.cptCode !== undefined) {
        updateFields.push(`cpt_code = $${paramIndex++}`);
        values.push(updates.cptCode);
      }
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.icd10Codes !== undefined) {
        updateFields.push(`icd10_codes = $${paramIndex++}`);
        values.push(updates.icd10Codes);
      }
      if (updates.units !== undefined) {
        updateFields.push(`units = $${paramIndex++}`);
        values.push(updates.units);
      }
      if (updates.fee !== undefined) {
        updateFields.push(`fee = $${paramIndex++}`);
        values.push(updates.fee);
      }
      if (updates.modifier !== undefined) {
        updateFields.push(`modifier = $${paramIndex++}`);
        values.push(updates.modifier);
      }

      if (updateFields.length === 0) {
        await client.query('COMMIT');
        return this.mapLineItem(lineItem);
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(lineItemId, tenantId);

      const result = await client.query(
        `UPDATE superbill_line_items
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      await client.query('COMMIT');
      return this.mapLineItem(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating line item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete a line item
   */
  async deleteLineItem(tenantId: string, lineItemId: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify superbill is not finalized
      const lineItemResult = await client.query(
        `SELECT li.superbill_id, s.status
         FROM superbill_line_items li
         JOIN superbills s ON s.id = li.superbill_id
         WHERE li.id = $1 AND li.tenant_id = $2`,
        [lineItemId, tenantId]
      );

      if (!lineItemResult.rowCount) {
        throw new Error('Line item not found');
      }

      const lineItem = lineItemResult.rows[0];
      if (lineItem.status === 'finalized' || lineItem.status === 'submitted') {
        throw new Error('Cannot delete line items from a finalized or submitted superbill');
      }

      await client.query(
        `DELETE FROM superbill_line_items WHERE id = $1 AND tenant_id = $2`,
        [lineItemId, tenantId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting line item:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate and return totals for a superbill
   */
  async calculateTotals(tenantId: string, superbillId: string): Promise<{
    totalCharges: number;
    lineCount: number;
    lineItems: SuperbillLineItem[];
  }> {
    const result = await pool.query(
      `SELECT * FROM superbill_line_items
       WHERE superbill_id = $1 AND tenant_id = $2
       ORDER BY line_sequence`,
      [superbillId, tenantId]
    );

    const lineItems = result.rows.map((row: Record<string, unknown>) => this.mapLineItem(row));
    const totalCharges = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      totalCharges,
      lineCount: lineItems.length,
      lineItems,
    };
  }

  /**
   * Finalize a superbill for billing
   */
  async finalizeSuperbill(tenantId: string, superbillId: string, userId: string): Promise<Superbill> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify superbill exists and is not already finalized
      const superbillResult = await client.query(
        `SELECT * FROM superbills WHERE id = $1 AND tenant_id = $2`,
        [superbillId, tenantId]
      );

      if (!superbillResult.rowCount) {
        throw new Error('Superbill not found');
      }

      const superbill = superbillResult.rows[0];
      if (superbill.status === 'finalized' || superbill.status === 'submitted') {
        throw new Error('Superbill is already finalized');
      }

      // Verify there are line items
      const lineCountResult = await client.query(
        `SELECT COUNT(*) as count FROM superbill_line_items WHERE superbill_id = $1`,
        [superbillId]
      );

      if (parseInt(lineCountResult.rows[0]?.count ?? '0') === 0) {
        throw new Error('Cannot finalize superbill with no line items');
      }

      // Update superbill status
      const result = await client.query(
        `UPDATE superbills
         SET status = 'finalized',
             finalized_at = NOW(),
             finalized_by = $3,
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [superbillId, tenantId, userId]
      );

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [crypto.randomUUID(), tenantId, userId, 'superbill_finalized', 'superbill', superbillId]
      );

      await client.query('COMMIT');
      logger.info(`Finalized superbill ${superbillId}`);

      return this.mapSuperbill(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error finalizing superbill:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get superbill by ID with line items
   */
  async getSuperbillById(tenantId: string, superbillId: string): Promise<Superbill | null> {
    const result = await pool.query(
      `SELECT * FROM superbills WHERE id = $1 AND tenant_id = $2`,
      [superbillId, tenantId]
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapSuperbill(result.rows[0]);
  }

  /**
   * Get superbill with full details
   */
  async getSuperbillDetails(tenantId: string, superbillId: string): Promise<{
    superbill: Superbill;
    lineItems: SuperbillLineItem[];
    patient: { id: string; firstName: string; lastName: string };
    provider: { id: string; fullName: string };
  } | null> {
    const result = await pool.query(
      `SELECT s.*,
              p.first_name as patient_first_name,
              p.last_name as patient_last_name,
              pr.full_name as provider_name
       FROM superbills s
       JOIN patients p ON p.id = s.patient_id
       LEFT JOIN providers pr ON pr.id = s.provider_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [superbillId, tenantId]
    );

    if (!result.rowCount) {
      return null;
    }

    const row = result.rows[0];
    const lineItemsResult = await pool.query(
      `SELECT * FROM superbill_line_items
       WHERE superbill_id = $1 AND tenant_id = $2
       ORDER BY line_sequence`,
      [superbillId, tenantId]
    );

    return {
      superbill: this.mapSuperbill(row),
      lineItems: lineItemsResult.rows.map((li: Record<string, unknown>) => this.mapLineItem(li)),
      patient: {
        id: row.patient_id,
        firstName: row.patient_first_name,
        lastName: row.patient_last_name,
      },
      provider: {
        id: row.provider_id,
        fullName: row.provider_name,
      },
    };
  }

  /**
   * Get superbill by encounter ID
   */
  async getSuperbillByEncounter(tenantId: string, encounterId: string): Promise<Superbill | null> {
    const result = await pool.query(
      `SELECT * FROM superbills WHERE encounter_id = $1 AND tenant_id = $2`,
      [encounterId, tenantId]
    );

    if (!result.rowCount) {
      return null;
    }

    return this.mapSuperbill(result.rows[0]);
  }

  /**
   * Get patient's superbill history
   */
  async getPatientSuperbills(
    tenantId: string,
    patientId: string,
    options?: { limit?: number; offset?: number; status?: SuperbillStatus }
  ): Promise<{ superbills: Superbill[]; total: number }> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let query = `
      SELECT s.*, COUNT(*) OVER() as total_count
      FROM superbills s
      WHERE s.tenant_id = $1 AND s.patient_id = $2
    `;
    const params: unknown[] = [tenantId, patientId];
    let paramIndex = 3;

    if (options?.status) {
      query += ` AND s.status = $${paramIndex++}`;
      params.push(options.status);
    }

    query += ` ORDER BY s.service_date DESC, s.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const total = result.rows[0]?.total_count ? parseInt(result.rows[0].total_count) : 0;
    const superbills = result.rows.map((row: Record<string, unknown>) => this.mapSuperbill(row));

    return { superbills, total };
  }

  /**
   * Get fee for a CPT code from fee schedule
   */
  async getFeeForCpt(tenantId: string, cptCode: string, payerId?: string): Promise<number> {
    // First try tenant-specific fee schedule
    const result = await pool.query(
      `SELECT default_fee, payer_specific_fees
       FROM fee_schedules
       WHERE tenant_id = $1
         AND cpt_code = $2
         AND is_default = TRUE
         AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
         AND effective_date <= CURRENT_DATE
       ORDER BY effective_date DESC
       LIMIT 1`,
      [tenantId, cptCode]
    );

    if (result.rowCount && result.rowCount > 0) {
      const schedule = result.rows[0];

      // Check for payer-specific fee
      if (payerId && schedule.payer_specific_fees && schedule.payer_specific_fees[payerId]) {
        return schedule.payer_specific_fees[payerId].fee;
      }

      return schedule.default_fee;
    }

    // Fall back to CPT code default
    const cptResult = await pool.query(
      `SELECT default_fee_cents FROM cpt_codes WHERE code = $1 LIMIT 1`,
      [cptCode]
    );

    if (cptResult.rowCount && cptResult.rowCount > 0) {
      return cptResult.rows[0]!.default_fee_cents ?? 0;
    }

    return 0;
  }

  /**
   * Get common dermatology codes
   */
  async getCommonCodes(
    tenantId: string,
    codeType: 'CPT' | 'ICD10',
    options?: { category?: string; favoritesOnly?: boolean; limit?: number }
  ): Promise<CommonDermCode[]> {
    const limit = options?.limit ?? 100;

    let query = `
      SELECT * FROM common_derm_codes
      WHERE code_type = $1
        AND (tenant_id = $2 OR tenant_id IS NULL)
    `;
    const params: unknown[] = [codeType, tenantId];
    let paramIndex = 3;

    if (options?.category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(options.category);
    }

    if (options?.favoritesOnly) {
      query += ` AND is_favorite = TRUE`;
    }

    query += ` ORDER BY tenant_id NULLS LAST, display_order, usage_count DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.map((row: Record<string, unknown>) => this.mapCommonCode(row));
  }

  /**
   * Search common codes
   */
  async searchCodes(
    tenantId: string,
    codeType: 'CPT' | 'ICD10',
    searchTerm: string,
    limit: number = 50
  ): Promise<CommonDermCode[]> {
    const result = await pool.query(
      `SELECT * FROM common_derm_codes
       WHERE code_type = $1
         AND (tenant_id = $2 OR tenant_id IS NULL)
         AND (code ILIKE $3 OR description ILIKE $3 OR category ILIKE $3)
       ORDER BY
         CASE WHEN code ILIKE $4 THEN 0 ELSE 1 END,
         usage_count DESC,
         display_order
       LIMIT $5`,
      [codeType, tenantId, `%${searchTerm}%`, `${searchTerm}%`, limit]
    );

    return result.rows.map((row: Record<string, unknown>) => this.mapCommonCode(row));
  }

  /**
   * Toggle favorite status for a code
   */
  async toggleFavorite(tenantId: string, codeId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE common_derm_codes
       SET is_favorite = NOT is_favorite, updated_at = NOW()
       WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
       RETURNING is_favorite`,
      [codeId, tenantId]
    );

    if (!result.rowCount) {
      throw new Error('Code not found');
    }

    return result.rows[0]!.is_favorite;
  }

  /**
   * Void a superbill
   */
  async voidSuperbill(tenantId: string, superbillId: string, userId: string, reason?: string): Promise<Superbill> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE superbills
         SET status = 'void',
             notes = COALESCE(notes || E'\\n', '') || $4,
             updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [superbillId, tenantId, userId, reason ? `Voided: ${reason}` : 'Voided']
      );

      if (!result.rowCount) {
        throw new Error('Superbill not found');
      }

      // Log audit event
      await client.query(
        `INSERT INTO audit_log (id, tenant_id, actor_id, action, entity, entity_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [crypto.randomUUID(), tenantId, userId, 'superbill_voided', 'superbill', superbillId, JSON.stringify({ reason })]
      );

      await client.query('COMMIT');
      return this.mapSuperbill(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error voiding superbill:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private mapSuperbill(row: Record<string, unknown>): Superbill {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      encounterId: row.encounter_id as string,
      patientId: row.patient_id as string,
      providerId: row.provider_id as string,
      serviceDate: row.service_date as string,
      placeOfService: row.place_of_service as string,
      status: row.status as SuperbillStatus,
      totalCharges: row.total_charges as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      finalizedAt: row.finalized_at as string | undefined,
      finalizedBy: row.finalized_by as string | undefined,
      notes: row.notes as string | undefined,
    };
  }

  private mapLineItem(row: Record<string, unknown>): SuperbillLineItem {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      superbillId: row.superbill_id as string,
      cptCode: row.cpt_code as string,
      description: row.description as string | undefined,
      icd10Codes: row.icd10_codes as string[],
      units: row.units as number,
      fee: row.fee as number,
      modifier: row.modifier as string | undefined,
      modifier2: row.modifier2 as string | undefined,
      modifier3: row.modifier3 as string | undefined,
      modifier4: row.modifier4 as string | undefined,
      lineTotal: row.line_total as number,
      lineSequence: row.line_sequence as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private mapCommonCode(row: Record<string, unknown>): CommonDermCode {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string | undefined,
      codeType: row.code_type as 'CPT' | 'ICD10',
      code: row.code as string,
      description: row.description as string,
      category: row.category as string | undefined,
      subcategory: row.subcategory as string | undefined,
      isFavorite: row.is_favorite as boolean,
      usageCount: row.usage_count as number,
      lastUsedAt: row.last_used_at as string | undefined,
      displayOrder: row.display_order as number,
    };
  }
}

export const superbillService = new SuperbillService();
