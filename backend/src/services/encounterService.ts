import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import crypto from 'crypto';
import { ensureMelanomaRecallForDiagnosis } from './melanomaRecallService';

export interface EncounterCreateData {
  tenantId: string;
  patientId: string;
  providerId: string;
  appointmentId?: string;
  chiefComplaint?: string;
}

export interface Encounter {
  id: string;
  tenantId: string;
  appointmentId?: string;
  patientId: string;
  providerId: string;
  status: string;
  chiefComplaint?: string;
  hpi?: string;
  ros?: string;
  exam?: string;
  assessmentPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterDiagnosis {
  id: string;
  encounterId: string;
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

export interface EncounterProcedure {
  id: string;
  encounterId: string;
  cptCode: string;
  description: string;
  modifiers?: string[];
  units: number;
}

export interface Charge {
  id: string;
  tenantId: string;
  encounterId: string;
  cptCode: string;
  description: string;
  quantity: number;
  feeCents: number;
  amountCents?: number;
  linkedDiagnosisIds: string[];
  icdCodes: string[];
  status: string;
  createdAt: string;
}

export class EncounterService {
  /**
   * Create an encounter from an appointment (called during check-in)
   */
  async createEncounterFromAppointment(
    tenantId: string,
    appointmentId: string,
    patientId: string,
    providerId: string,
    chiefComplaint?: string
  ): Promise<Encounter> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if encounter already exists for this appointment
      const existingCheck = await client.query(
        `SELECT id FROM encounters WHERE tenant_id = $1 AND appointment_id = $2`,
        [tenantId, appointmentId]
      );

      if (existingCheck.rowCount && existingCheck.rowCount > 0) {
        // Return existing encounter
        const result = await client.query(
          `SELECT id, tenant_id, appointment_id, patient_id, provider_id, status,
                  chief_complaint, hpi, ros, exam, assessment_plan, created_at, updated_at
           FROM encounters
           WHERE id = $1`,
          [existingCheck.rows[0].id]
        );
        await client.query('COMMIT');
        return this.mapEncounter(result.rows[0]);
      }

      // Create new encounter
      const encounterId = crypto.randomUUID();
      const encounterResult = await client.query(
        `INSERT INTO encounters (
          id, tenant_id, appointment_id, patient_id, provider_id,
          status, chief_complaint, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, tenant_id, appointment_id, patient_id, provider_id, status,
                  chief_complaint, hpi, ros, exam, assessment_plan, created_at, updated_at`,
        [encounterId, tenantId, appointmentId, patientId, providerId, 'draft', chiefComplaint || null]
      );

      await client.query('COMMIT');
      logger.info(`Created encounter ${encounterId} for appointment ${appointmentId}`);
      return this.mapEncounter(encounterResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating encounter from appointment:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate charges from encounter diagnoses and procedures
   */
  async generateChargesFromEncounter(
    tenantId: string,
    encounterId: string
  ): Promise<Charge[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get encounter details
      const encounterResult = await client.query(
        `SELECT e.id, e.patient_id, e.provider_id,
                COALESCE(a.scheduled_start::date, e.created_at::date, CURRENT_DATE) as service_date
         FROM encounters e
         LEFT JOIN appointments a ON a.id = e.appointment_id AND a.tenant_id = e.tenant_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        throw new Error('Encounter not found');
      }

      // Get diagnoses
      const diagnosesResult = await client.query(
        `SELECT id, icd10_code, description, is_primary
         FROM encounter_diagnoses
         WHERE encounter_id = $1 AND tenant_id = $2
         ORDER BY is_primary DESC, created_at`,
        [encounterId, tenantId]
      );

      const diagnoses = diagnosesResult.rows;

      // Get procedures (from encounter_procedures table or similar)
      // For now, we'll look for charges that were manually added but need pricing
      const proceduresResult = await client.query(
        `SELECT id, cpt_code, description, quantity
         FROM charges
         WHERE encounter_id = $1 AND tenant_id = $2 AND fee_cents IS NULL`,
        [encounterId, tenantId]
      );

      const charges: Charge[] = [];

      // Process each procedure and apply pricing
      for (const proc of proceduresResult.rows) {
        let feeCents = 0;

        const feeResult = await client.query(
          `SELECT COALESCE(fsi.fee_cents, ROUND(fsi.fee_amount * 100)::int, 0) as fee_cents
           FROM fee_schedule_items fsi
           JOIN fee_schedules fs ON fs.id = fsi.fee_schedule_id
           WHERE fs.tenant_id = $1
             AND UPPER(fsi.cpt_code) = UPPER($2)
           ORDER BY fs.is_default DESC, fsi.updated_at DESC NULLS LAST, fsi.created_at DESC
           LIMIT 1`,
          [tenantId, proc.cpt_code]
        );

        if (feeResult.rowCount) {
          feeCents = feeResult.rows[0].fee_cents || 0;
        } else {
          // Use default fee from CPT code
          const cptResult = await client.query(
            `SELECT default_fee_cents FROM cpt_codes WHERE UPPER(code) = UPPER($1)`,
            [proc.cpt_code]
          );
          if (cptResult.rowCount) {
            feeCents = cptResult.rows[0].default_fee_cents || 0;
          }
        }

        // Update charge with fee and link to diagnoses
        const diagnosisIds = diagnoses.map(d => d.id);
        const icdCodes = diagnoses.map(d => d.icd10_code);
        const quantity = proc.quantity || 1;
        const amountCents = feeCents * quantity;

        await client.query(
          `UPDATE charges
           SET fee_cents = $1,
               linked_diagnosis_ids = $2,
               icd_codes = $3,
               amount_cents = $4::int,
               amount = ROUND(($4::numeric / 100), 2),
               patient_id = $5,
               service_date = $6,
               status = 'pending'
           WHERE id = $7 AND tenant_id = $8`,
          [
            feeCents,
            diagnosisIds,
            icdCodes,
            amountCents,
            encounterResult.rows[0].patient_id,
            encounterResult.rows[0].service_date,
            proc.id,
            tenantId,
          ]
        );

        charges.push({
          id: proc.id,
          tenantId,
          encounterId,
          cptCode: proc.cpt_code,
          description: proc.description,
          quantity,
          feeCents,
          amountCents,
          linkedDiagnosisIds: diagnosisIds,
          icdCodes,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }

      await client.query('COMMIT');
      logger.info(`Generated ${charges.length} charges for encounter ${encounterId}`);
      return charges;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error generating charges from encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a procedure/charge to an encounter
   */
  async addProcedure(
    tenantId: string,
    encounterId: string,
    cptCode: string,
    description: string,
    quantity: number = 1,
    modifiers?: string[]
  ): Promise<string> {
    const client = await pool.connect();
    try {
      const chargeId = crypto.randomUUID();

      await client.query(
        `INSERT INTO charges (
          id, tenant_id, encounter_id, cpt_code, description,
          quantity, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [chargeId, tenantId, encounterId, cptCode, description, quantity, 'draft']
      );

      logger.info(`Added procedure ${cptCode} to encounter ${encounterId}`);
      return chargeId;
    } catch (error) {
      logger.error('Error adding procedure to encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a diagnosis to an encounter
   */
  async addDiagnosis(
    tenantId: string,
    encounterId: string,
    icd10Code: string,
    description: string,
    isPrimary: boolean = false,
    createdBy?: string
  ): Promise<string> {
    const client = await pool.connect();
    try {
      // If this is primary, unmark any existing primary diagnoses
      if (isPrimary) {
        await client.query(
          `UPDATE encounter_diagnoses
           SET is_primary = false
           WHERE encounter_id = $1 AND tenant_id = $2`,
          [encounterId, tenantId]
        );
      }

      const diagnosisId = crypto.randomUUID();
      await client.query(
        `INSERT INTO encounter_diagnoses (
          id, tenant_id, encounter_id, icd10_code, description,
          is_primary, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [diagnosisId, tenantId, encounterId, icd10Code, description, isPrimary]
      );

      await ensureMelanomaRecallForDiagnosis({
        tenantId,
        encounterId,
        icd10Code,
        description,
        userId: createdBy,
      });

      logger.info(`Added diagnosis ${icd10Code} to encounter ${encounterId}`);
      return diagnosisId;
    } catch (error) {
      logger.error('Error adding diagnosis to encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete an encounter and generate charges
   */
  async completeEncounter(
    tenantId: string,
    encounterId: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update encounter status
      await client.query(
        `UPDATE encounters
         SET status = 'completed', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [encounterId, tenantId]
      );

      // Generate charges from procedures
      await this.generateChargesFromEncounter(tenantId, encounterId);

      await client.query('COMMIT');
      logger.info(`Completed encounter ${encounterId} and generated charges`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error completing encounter:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get encounter with all related data
   */
  async getEncounterDetails(
    tenantId: string,
    encounterId: string
  ): Promise<any> {
    try {
      const encounterResult = await pool.query(
        `SELECT e.*,
                p.first_name, p.last_name, p.dob,
                pr.full_name as provider_name
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         JOIN providers pr ON pr.id = e.provider_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [encounterId, tenantId]
      );

      if (!encounterResult.rowCount) {
        return null;
      }

      const encounter = encounterResult.rows[0];

      // Get diagnoses
      const diagnosesResult = await pool.query(
        `SELECT id, icd10_code, description, is_primary
         FROM encounter_diagnoses
         WHERE encounter_id = $1 AND tenant_id = $2
         ORDER BY is_primary DESC, created_at`,
        [encounterId, tenantId]
      );

      // Get charges
      const chargesResult = await pool.query(
        `SELECT id, cpt_code, description, quantity, fee_cents,
                linked_diagnosis_ids, icd_codes, status, created_at
         FROM charges
         WHERE encounter_id = $1 AND tenant_id = $2
         ORDER BY created_at`,
        [encounterId, tenantId]
      );

      return {
        ...encounter,
        diagnoses: diagnosesResult.rows,
        charges: chargesResult.rows,
      };
    } catch (error) {
      logger.error('Error getting encounter details:', error);
      throw error;
    }
  }

  private mapEncounter(row: any): Encounter {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      appointmentId: row.appointment_id,
      patientId: row.patient_id,
      providerId: row.provider_id,
      status: row.status,
      chiefComplaint: row.chief_complaint,
      hpi: row.hpi,
      ros: row.ros,
      exam: row.exam,
      assessmentPlan: row.assessment_plan,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const encounterService = new EncounterService();
