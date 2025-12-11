import crypto from "crypto";
import { pool } from "../db/pool";

interface LearningRecord {
  diagnosisCodes: string[];
  procedureCodes: string[];
}

/**
 * Learning Service
 * Processes encounter data to build provider-specific usage patterns
 * for intelligent auto-suggestions of diagnoses and procedures
 */

/**
 * Record diagnosis usage by a provider
 * Increments frequency count and updates last_used timestamp
 */
export async function recordDiagnosisUsage(
  tenantId: string,
  providerId: string,
  icd10Code: string,
): Promise<void> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO provider_diagnosis_frequency (id, tenant_id, provider_id, icd10_code, frequency_count, last_used)
     VALUES ($1, $2, $3, $4, 1, NOW())
     ON CONFLICT (provider_id, icd10_code)
     DO UPDATE SET
       frequency_count = provider_diagnosis_frequency.frequency_count + 1,
       last_used = NOW()`,
    [id, tenantId, providerId, icd10Code],
  );
}

/**
 * Record procedure usage by a provider
 * Increments frequency count and updates last_used timestamp
 */
export async function recordProcedureUsage(
  tenantId: string,
  providerId: string,
  cptCode: string,
): Promise<void> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO provider_procedure_frequency (id, tenant_id, provider_id, cpt_code, frequency_count, last_used)
     VALUES ($1, $2, $3, $4, 1, NOW())
     ON CONFLICT (provider_id, cpt_code)
     DO UPDATE SET
       frequency_count = provider_procedure_frequency.frequency_count + 1,
       last_used = NOW()`,
    [id, tenantId, providerId, cptCode],
  );
}

/**
 * Record diagnosis-procedure pair usage
 * Tracks which procedures are commonly used with which diagnoses
 */
export async function recordDiagnosisProcedurePair(
  tenantId: string,
  providerId: string,
  icd10Code: string,
  cptCode: string,
): Promise<void> {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO diagnosis_procedure_pairs (id, tenant_id, provider_id, icd10_code, cpt_code, pair_count, last_used)
     VALUES ($1, $2, $3, $4, $5, 1, NOW())
     ON CONFLICT (provider_id, icd10_code, cpt_code)
     DO UPDATE SET
       pair_count = diagnosis_procedure_pairs.pair_count + 1,
       last_used = NOW()`,
    [id, tenantId, providerId, icd10Code, cptCode],
  );
}

/**
 * Process an entire encounter to extract and record learning patterns
 * Called automatically when an encounter is finalized
 */
export async function recordEncounterLearning(encounterId: string): Promise<void> {
  // Get encounter details with provider info
  const encounterResult = await pool.query(
    `SELECT tenant_id, provider_id FROM encounters WHERE id = $1`,
    [encounterId],
  );

  if (encounterResult.rowCount === 0) {
    throw new Error(`Encounter not found: ${encounterId}`);
  }

  const { tenant_id: tenantId, provider_id: providerId } = encounterResult.rows[0];

  // Get all diagnoses for this encounter
  const diagnosesResult = await pool.query(
    `SELECT DISTINCT icd10_code FROM encounter_diagnoses WHERE encounter_id = $1 AND tenant_id = $2`,
    [encounterId, tenantId],
  );

  const diagnosisCodes = diagnosesResult.rows.map((row) => row.icd10_code);

  // Get all procedures/charges for this encounter
  const chargesResult = await pool.query(
    `SELECT DISTINCT cpt_code FROM charges WHERE encounter_id = $1 AND tenant_id = $2`,
    [encounterId, tenantId],
  );

  const procedureCodes = chargesResult.rows.map((row) => row.cpt_code);

  // Record diagnosis frequencies
  for (const icd10Code of diagnosisCodes) {
    await recordDiagnosisUsage(tenantId, providerId, icd10Code);
  }

  // Record procedure frequencies
  for (const cptCode of procedureCodes) {
    await recordProcedureUsage(tenantId, providerId, cptCode);
  }

  // Record diagnosis-procedure pairs (all combinations used in this encounter)
  for (const icd10Code of diagnosisCodes) {
    for (const cptCode of procedureCodes) {
      await recordDiagnosisProcedurePair(tenantId, providerId, icd10Code, cptCode);
    }
  }
}

/**
 * Calculate adaptive score based on frequency and recency
 * score = (frequency_count * 0.7) + (recency_score * 0.3)
 */
export function calculateAdaptiveScore(frequencyCount: number, lastUsed: Date): number {
  const now = new Date();
  const daysSinceLastUse = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));

  let recencyScore: number;
  if (daysSinceLastUse < 7) {
    recencyScore = 1.0;
  } else if (daysSinceLastUse < 30) {
    recencyScore = 0.7;
  } else if (daysSinceLastUse < 90) {
    recencyScore = 0.4;
  } else {
    recencyScore = 0.2;
  }

  return frequencyCount * 0.7 + recencyScore * 0.3;
}
