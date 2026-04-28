/**
 * Allergy Alert Service
 *
 * Comprehensive allergy checking and alerting system for the dermatology EHR.
 * Handles drug allergies, cross-reactivity, latex alerts, adhesive alerts,
 * and contact allergies from patch testing.
 */

import { pool } from '../db/pool';
import { getPatientAllergySummaries } from './patientHealthRecord';

// ============================================================================
// Types and Interfaces
// ============================================================================

export type AllergenType = 'drug' | 'food' | 'environmental' | 'latex' | 'contact';
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';
export type AllergyStatus = 'active' | 'inactive' | 'resolved' | 'entered_in_error';
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'contraindicated';
export type AlertAction = 'override' | 'cancelled' | 'changed' | 'acknowledged' | 'pending';
export type AlertType = 'drug_allergy' | 'cross_reactivity' | 'latex' | 'adhesive' | 'contact' | 'food';

export interface AllergyData {
  allergenType: AllergenType;
  allergenName: string;
  rxcui?: string;
  reactionType?: string;
  severity: AllergySeverity;
  onsetDate?: string;
  notes?: string;
  source?: string;
  symptoms?: string[];
  reactionDescription?: string;
}

export interface PatientAllergy {
  id: string;
  patientId: string;
  allergenType: AllergenType;
  allergenName: string;
  rxcui?: string;
  reactionType?: string;
  severity: AllergySeverity;
  onsetDate?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  status: AllergyStatus;
  notes?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AllergyAlert {
  id?: string;
  alertType: AlertType;
  alertSeverity: AlertSeverity;
  allergyId?: string;
  allergenName: string;
  triggerDrug?: string;
  triggerRxcui?: string;
  message: string;
  crossReactiveWith?: string;
  crossReactivityRate?: number;
  recommendations?: string;
  reactions?: string[];
}

export interface CrossReactivity {
  primaryAllergen: string;
  primaryDrugClass?: string;
  crossReactiveAllergens: string[];
  crossReactivityType: string;
  crossReactivityRate?: number;
  clinicalSignificance?: string;
  recommendations?: string;
}

export interface DrugAllergyCheckResult {
  hasAllergy: boolean;
  alerts: AllergyAlert[];
  directMatch: boolean;
  crossReactivityMatch: boolean;
}

// ============================================================================
// Core Service Functions
// ============================================================================

/**
 * Add a new allergy for a patient
 */
export async function addAllergy(
  patientId: string,
  allergyData: AllergyData,
  tenantId: string,
  userId: string
): Promise<{ id: string; success: boolean }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert the allergy record
    const allergyResult = await client.query(
      `INSERT INTO patient_allergies (
        tenant_id, patient_id, allergen_type, allergen, rxcui,
        reaction_type, severity, onset_date, notes, source,
        status, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $11)
      RETURNING id`,
      [
        tenantId,
        patientId,
        allergyData.allergenType,
        allergyData.allergenName,
        allergyData.rxcui || null,
        allergyData.reactionType || null,
        allergyData.severity,
        allergyData.onsetDate || null,
        allergyData.notes || null,
        allergyData.source || 'patient_reported',
        userId
      ]
    );

    const allergyId = allergyResult.rows[0]?.id as string;

    // If reaction details provided, add to allergy_reactions table
    if (allergyData.reactionDescription || (allergyData.symptoms && allergyData.symptoms.length > 0)) {
      await client.query(
        `INSERT INTO allergy_reactions (
          allergy_id, reaction_description, symptoms, documented_by
        ) VALUES ($1, $2, $3, $4)`,
        [
          allergyId,
          allergyData.reactionDescription || allergyData.allergenName + ' allergy reaction',
          allergyData.symptoms || [],
          userId
        ]
      );
    }

    await client.query('COMMIT');

    return { id: allergyId, success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update an existing allergy
 */
export async function updateAllergy(
  allergyId: string,
  updates: Partial<AllergyData> & { status?: AllergyStatus },
  tenantId: string,
  userId: string
): Promise<{ success: boolean }> {
  const updateFields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.allergenType !== undefined) {
    updateFields.push(`allergen_type = $${paramIndex++}`);
    values.push(updates.allergenType);
  }
  if (updates.allergenName !== undefined) {
    updateFields.push(`allergen = $${paramIndex++}`);
    values.push(updates.allergenName);
  }
  if (updates.rxcui !== undefined) {
    updateFields.push(`rxcui = $${paramIndex++}`);
    values.push(updates.rxcui);
  }
  if (updates.reactionType !== undefined) {
    updateFields.push(`reaction_type = $${paramIndex++}`);
    values.push(updates.reactionType);
  }
  if (updates.severity !== undefined) {
    updateFields.push(`severity = $${paramIndex++}`);
    values.push(updates.severity);
  }
  if (updates.onsetDate !== undefined) {
    updateFields.push(`onset_date = $${paramIndex++}`);
    values.push(updates.onsetDate);
  }
  if (updates.notes !== undefined) {
    updateFields.push(`notes = $${paramIndex++}`);
    values.push(updates.notes);
  }
  if (updates.status !== undefined) {
    updateFields.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }

  if (updateFields.length === 0) {
    return { success: true };
  }

  updateFields.push(`updated_by = $${paramIndex++}`);
  values.push(userId);

  values.push(allergyId, tenantId);

  await pool.query(
    `UPDATE patient_allergies
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}`,
    values
  );

  return { success: true };
}

/**
 * Get patient's allergies
 */
export async function getPatientAllergies(
  patientId: string,
  tenantId: string,
  options?: { status?: AllergyStatus; includeReactions?: boolean }
): Promise<PatientAllergy[]> {
  let query = `
    SELECT
      pa.id,
      pa.patient_id as "patientId",
      pa.allergen_type as "allergenType",
      pa.allergen as "allergenName",
      pa.rxcui,
      COALESCE(NULLIF(pa.reaction_type, ''), NULLIF(pa.reaction, '')) as "reactionType",
      pa.severity,
      pa.onset_date as "onsetDate",
      pa.verified_by as "verifiedBy",
      pa.verified_at as "verifiedAt",
      pa.status,
      pa.notes,
      pa.source,
      pa.created_at as "createdAt",
      pa.updated_at as "updatedAt"
    FROM patient_allergies pa
    WHERE pa.patient_id = $1 AND pa.tenant_id = $2
  `;

  const params: unknown[] = [patientId, tenantId];

  if (options?.status) {
    query += ` AND pa.status = $3`;
    params.push(options.status);
  }

  query += ` ORDER BY
    CASE pa.severity
      WHEN 'life_threatening' THEN 1
      WHEN 'severe' THEN 2
      WHEN 'moderate' THEN 3
      WHEN 'mild' THEN 4
    END,
    pa.allergen`;

  const result = await pool.query(query, params);
  const allergies = result.rows as PatientAllergy[];

  if (!options?.status || options.status === 'active') {
    const existingAllergens = new Set(allergies.map((allergy) => allergy.allergenName.toLowerCase()));
    const legacyAllergies = await getPatientAllergySummaries(tenantId, patientId, pool, {
      includeStructured: false,
    });

    for (const legacyAllergy of legacyAllergies) {
      if (existingAllergens.has(legacyAllergy.allergenName.toLowerCase())) continue;
      allergies.push({
        id: legacyAllergy.id,
        patientId,
        allergenType: 'drug',
        allergenName: legacyAllergy.allergenName,
        reactionType: legacyAllergy.reaction !== 'Unknown' ? legacyAllergy.reaction : undefined,
        severity: 'mild',
        status: 'active',
        notes: legacyAllergy.notes || undefined,
        source: legacyAllergy.source || 'patient_record',
        createdAt: '',
        updatedAt: '',
      });
    }
  }

  // Optionally include detailed reactions
  if (options?.includeReactions && allergies.length > 0) {
    const allergyIds = allergies.map(a => a.id);
    const reactionsResult = await pool.query(
      `SELECT allergy_id, reaction_description, symptoms
       FROM allergy_reactions
       WHERE allergy_id = ANY($1)`,
      [allergyIds]
    );

    const reactionsMap = new Map<string, { description: string; symptoms: string[] }[]>();
    for (const row of reactionsResult.rows) {
      const allergyId = row.allergy_id as string;
      if (!reactionsMap.has(allergyId)) {
        reactionsMap.set(allergyId, []);
      }
      reactionsMap.get(allergyId)?.push({
        description: row.reaction_description as string,
        symptoms: row.symptoms as string[]
      });
    }

    for (const allergy of allergies) {
      (allergy as PatientAllergy & { reactions?: { description: string; symptoms: string[] }[] }).reactions =
        reactionsMap.get(allergy.id) || [];
    }
  }

  return allergies;
}

/**
 * Check for drug allergy before prescribing
 * Returns direct matches and cross-reactivity warnings
 */
export async function checkDrugAllergy(
  patientId: string,
  rxcui: string,
  drugName: string,
  tenantId: string
): Promise<DrugAllergyCheckResult> {
  const alerts: AllergyAlert[] = [];
  let directMatch = false;
  let crossReactivityMatch = false;

  const allergies = (await getPatientAllergies(patientId, tenantId, { status: 'active' }))
    .filter((allergy) => allergy.allergenType === 'drug');

  const drugNameLower = drugName.toLowerCase();

  // Check for direct matches
  for (const allergy of allergies) {
    const allergenLower = allergy.allergenName.toLowerCase();

    // Check if drug name matches allergy
    if (
      drugNameLower.includes(allergenLower) ||
      allergenLower.includes(drugNameLower) ||
      (allergy.rxcui && allergy.rxcui === rxcui)
    ) {
      directMatch = true;

      const alertSeverity = mapAllergySeverityToAlertSeverity(allergy.severity);

      alerts.push({
        alertType: 'drug_allergy',
        alertSeverity,
        allergyId: allergy.id,
        allergenName: allergy.allergenName,
        triggerDrug: drugName,
        triggerRxcui: rxcui,
        message: `Patient is allergic to ${allergy.allergenName}. ` +
                 `Severity: ${allergy.severity}. ` +
                 (allergy.reactionType ? `Reaction: ${allergy.reactionType}.` : ''),
        reactions: allergy.notes ? [allergy.notes] : []
      });
    }
  }

  // Check for cross-reactivity
  const crossReactivityAlerts = await checkCrossReactivity(
    patientId,
    drugName,
    tenantId
  );

  if (crossReactivityAlerts.length > 0) {
    crossReactivityMatch = true;
    alerts.push(...crossReactivityAlerts);
  }

  return {
    hasAllergy: directMatch || crossReactivityMatch,
    alerts,
    directMatch,
    crossReactivityMatch
  };
}

/**
 * Check for cross-reactivity with known drug classes
 */
export async function checkCrossReactivity(
  patientId: string,
  drugName: string,
  tenantId: string
): Promise<AllergyAlert[]> {
  const alerts: AllergyAlert[] = [];
  const drugNameLower = drugName.toLowerCase();

  const allergies = (await getPatientAllergies(patientId, tenantId, { status: 'active' }))
    .filter((allergy) => allergy.allergenType === 'drug');

  for (const allergy of allergies) {
    const allergenLower = allergy.allergenName.toLowerCase();

    // Check cross-reactivity table
    const crossResult = await pool.query(
      `SELECT
        primary_allergen,
        cross_reactive_allergens,
        cross_reactivity_rate,
        clinical_significance,
        recommendations
       FROM allergy_cross_reactivity
       WHERE LOWER(primary_allergen) = $1
          OR LOWER(primary_allergen) LIKE $2`,
      [allergenLower, `%${allergenLower}%`]
    );

    for (const crossRow of crossResult.rows) {
      const crossReactiveAllergens = crossRow.cross_reactive_allergens as string[];

      // Check if the drug being prescribed is in the cross-reactive list
      const isCrossReactive = crossReactiveAllergens.some(
        (crossAllergen: string) =>
          drugNameLower.includes(crossAllergen.toLowerCase()) ||
          crossAllergen.toLowerCase().includes(drugNameLower)
      );

      if (isCrossReactive) {
        const significance = crossRow.clinical_significance as string;
        let alertSeverity: AlertSeverity = 'warning';

        if (significance === 'high') {
          alertSeverity = 'critical';
        } else if (significance === 'moderate') {
          alertSeverity = 'warning';
        } else {
          alertSeverity = 'info';
        }

        alerts.push({
          alertType: 'cross_reactivity',
          alertSeverity,
          allergyId: allergy.id,
          allergenName: allergy.allergenName,
          triggerDrug: drugName,
          message: `Patient is allergic to ${allergy.allergenName}. ` +
                   `${drugName} may have cross-reactivity ` +
                   (crossRow.cross_reactivity_rate
                     ? `(~${crossRow.cross_reactivity_rate}% of patients react).`
                     : '.'),
          crossReactiveWith: allergy.allergenName,
          crossReactivityRate: crossRow.cross_reactivity_rate as number | undefined,
          recommendations: crossRow.recommendations as string | undefined
        });
      }
    }
  }

  return alerts;
}

/**
 * Check for latex allergy before procedures
 */
export async function checkLatexAllergy(
  patientId: string,
  tenantId: string
): Promise<AllergyAlert | null> {
  const allergies = await getPatientAllergies(patientId, tenantId, { status: 'active' });
  const allergy = allergies.find((item) => {
    const name = item.allergenName.toLowerCase();
    return item.allergenType === 'latex' || name.includes('latex') || name.includes('rubber');
  });

  if (!allergy) {
    return null;
  }

  const alertSeverity = mapAllergySeverityToAlertSeverity(allergy.severity);

  // Also check for latex-fruit syndrome
  const fruitAllergies = allergies.filter(
    (item) =>
      item.allergenType === 'food' &&
      ['banana', 'avocado', 'kiwi', 'chestnut'].includes(item.allergenName.toLowerCase())
  );

  let message = `LATEX ALLERGY: Patient has documented latex allergy (${allergy.severity}).`;

  if (fruitAllergies.length > 0) {
    message += ` Also allergic to: ${fruitAllergies.map((item) => item.allergenName).join(', ')} (latex-fruit syndrome).`;
  }

  message += ' Use non-latex gloves and equipment.';

  return {
    alertType: 'latex',
    alertSeverity,
    allergyId: allergy.id,
    allergenName: 'Latex',
    message,
    recommendations: 'Use nitrile, vinyl, or neoprene gloves. Ensure all equipment is latex-free.',
    reactions: allergy.reactionType ? [allergy.reactionType] : []
  };
}

/**
 * Check for adhesive/tape allergy
 */
export async function checkAdhesiveAllergy(
  patientId: string,
  tenantId: string
): Promise<AllergyAlert | null> {
  const allergies = await getPatientAllergies(patientId, tenantId, { status: 'active' });
  const allergy = allergies.find((item) => {
    const name = item.allergenName.toLowerCase();
    return item.allergenType === 'contact' ||
      name.includes('adhesive') ||
      name.includes('tape') ||
      name.includes('bandage') ||
      name.includes('acrylate') ||
      name.includes('colophony');
  });

  if (!allergy) {
    return null;
  }

  const alertSeverity = mapAllergySeverityToAlertSeverity(allergy.severity);

  return {
    alertType: 'adhesive',
    alertSeverity,
    allergyId: allergy.id,
    allergenName: allergy.allergenName,
    message: `ADHESIVE ALLERGY: Patient is allergic to ${allergy.allergenName}. ` +
             `Use hypoallergenic or silicone-based alternatives.`,
    recommendations: 'Use paper tape, silicone adhesive dressings, or gauze wrapping.',
    reactions: allergy.reactionType ? [allergy.reactionType] : []
  };
}

/**
 * Get all active allergy alerts for a patient
 * Useful for displaying a summary in the patient header/banner
 */
export async function getActiveAlerts(
  patientId: string,
  tenantId: string
): Promise<AllergyAlert[]> {
  const alerts: AllergyAlert[] = [];

  // Get all active allergies
  const allergies = await getPatientAllergies(patientId, tenantId, { status: 'active' });

  for (const allergy of allergies) {
    const alertSeverity = mapAllergySeverityToAlertSeverity(allergy.severity);

    let alertType: AlertType = 'drug_allergy';
    if (allergy.allergenType === 'latex') {
      alertType = 'latex';
    } else if (allergy.allergenType === 'contact') {
      alertType = 'contact';
    } else if (allergy.allergenType === 'food') {
      alertType = 'food';
    }

    alerts.push({
      alertType,
      alertSeverity,
      allergyId: allergy.id,
      allergenName: allergy.allergenName,
      message: `${allergy.allergenName} (${allergy.severity})` +
               (allergy.reactionType ? ` - ${allergy.reactionType}` : ''),
      reactions: allergy.notes ? [allergy.notes] : []
    });
  }

  // Sort by severity
  alerts.sort((a, b) => {
    const severityOrder: Record<AlertSeverity, number> = {
      contraindicated: 0,
      critical: 1,
      warning: 2,
      info: 3
    };
    return severityOrder[a.alertSeverity] - severityOrder[b.alertSeverity];
  });

  return alerts;
}

/**
 * Log an alert action (for audit trail)
 */
export async function logAlertAction(
  alertData: {
    patientId: string;
    alertType: AlertType;
    triggerDrug?: string;
    triggerRxcui?: string;
    allergyId?: string;
    alertSeverity: AlertSeverity;
    alertMessage?: string;
    crossReactiveWith?: string;
    displayContext?: string;
    encounterId?: string;
    prescriptionId?: string;
  },
  action: AlertAction,
  userId: string,
  tenantId: string,
  actionReason?: string
): Promise<{ id: string }> {
  const result = await pool.query(
    `INSERT INTO allergy_alerts_log (
      tenant_id, patient_id, alert_type, trigger_drug, trigger_rxcui,
      allergy_id, alert_severity, alert_message, cross_reactive_with,
      displayed_to, display_context, action_taken, action_at, action_reason,
      encounter_id, prescription_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, $13, $14, $15)
    RETURNING id`,
    [
      tenantId,
      alertData.patientId,
      alertData.alertType,
      alertData.triggerDrug || null,
      alertData.triggerRxcui || null,
      alertData.allergyId || null,
      alertData.alertSeverity,
      alertData.alertMessage || null,
      alertData.crossReactiveWith || null,
      userId,
      alertData.displayContext || null,
      action,
      actionReason || null,
      alertData.encounterId || null,
      alertData.prescriptionId || null
    ]
  );

  return { id: result.rows[0]?.id as string };
}

/**
 * Get alert history for a patient (for audit/review)
 */
export async function getAlertHistory(
  patientId: string,
  tenantId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    alertType?: AlertType;
    limit?: number;
  }
): Promise<{
  id: string;
  alertType: AlertType;
  triggerDrug?: string;
  alertSeverity: AlertSeverity;
  displayedAt: string;
  displayedTo: string;
  actionTaken?: AlertAction;
  actionReason?: string;
}[]> {
  let query = `
    SELECT
      aal.id,
      aal.alert_type as "alertType",
      aal.trigger_drug as "triggerDrug",
      aal.alert_severity as "alertSeverity",
      aal.displayed_at as "displayedAt",
      u.full_name as "displayedTo",
      aal.action_taken as "actionTaken",
      aal.action_reason as "actionReason"
    FROM allergy_alerts_log aal
    JOIN users u ON aal.displayed_to = u.id
    WHERE aal.patient_id = $1 AND aal.tenant_id = $2
  `;

  const params: unknown[] = [patientId, tenantId];
  let paramIndex = 3;

  if (options?.startDate) {
    query += ` AND aal.displayed_at >= $${paramIndex++}`;
    params.push(options.startDate);
  }

  if (options?.endDate) {
    query += ` AND aal.displayed_at <= $${paramIndex++}`;
    params.push(options.endDate);
  }

  if (options?.alertType) {
    query += ` AND aal.alert_type = $${paramIndex++}`;
    params.push(options.alertType);
  }

  query += ` ORDER BY aal.displayed_at DESC`;

  if (options?.limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(options.limit);
  }

  const result = await pool.query(query, params);
  return result.rows as {
    id: string;
    alertType: AlertType;
    triggerDrug?: string;
    alertSeverity: AlertSeverity;
    displayedAt: string;
    displayedTo: string;
    actionTaken?: AlertAction;
    actionReason?: string;
  }[];
}

/**
 * Verify an allergy (mark as clinically verified by provider)
 */
export async function verifyAllergy(
  allergyId: string,
  tenantId: string,
  verifierId: string
): Promise<{ success: boolean }> {
  await pool.query(
    `UPDATE patient_allergies
     SET verified_by = $1, verified_at = CURRENT_TIMESTAMP, updated_by = $1
     WHERE id = $2 AND tenant_id = $3`,
    [verifierId, allergyId, tenantId]
  );

  return { success: true };
}

/**
 * Delete (inactivate) an allergy
 */
export async function deleteAllergy(
  allergyId: string,
  tenantId: string,
  userId: string
): Promise<{ success: boolean }> {
  await pool.query(
    `UPDATE patient_allergies
     SET status = 'inactive', updated_by = $1
     WHERE id = $2 AND tenant_id = $3`,
    [userId, allergyId, tenantId]
  );

  return { success: true };
}

/**
 * Get common dermatology allergies for quick selection
 */
export function getCommonDermatologyAllergies(): {
  drugs: { name: string; rxcui?: string }[];
  topicals: { name: string }[];
  other: { name: string; type: AllergenType }[];
} {
  return {
    drugs: [
      { name: 'Sulfonamides (Sulfa drugs)', rxcui: '10831' },
      { name: 'Dapsone', rxcui: '3108' },
      { name: 'Doxycycline', rxcui: '3640' },
      { name: 'Minocycline', rxcui: '6922' },
      { name: 'Tetracycline', rxcui: '10395' },
      { name: 'Isotretinoin', rxcui: '6064' },
      { name: 'Penicillin', rxcui: '7984' },
      { name: 'Amoxicillin', rxcui: '723' },
      { name: 'Cephalexin', rxcui: '2176' },
      { name: 'Trimethoprim', rxcui: '10829' },
      { name: 'Methotrexate', rxcui: '6851' },
      { name: 'Hydroxychloroquine', rxcui: '5521' },
      { name: 'Prednisone', rxcui: '8640' },
      { name: 'Lidocaine', rxcui: '6387' }
    ],
    topicals: [
      { name: 'Neomycin' },
      { name: 'Bacitracin' },
      { name: 'Triple Antibiotic Ointment' },
      { name: 'Benzoyl Peroxide' },
      { name: 'Salicylic Acid' },
      { name: 'Hydrocortisone' },
      { name: 'Tretinoin' },
      { name: 'Adapalene' },
      { name: 'Imiquimod' },
      { name: 'Fluorouracil (5-FU)' }
    ],
    other: [
      { name: 'Latex', type: 'latex' },
      { name: 'Medical Adhesive/Tape', type: 'contact' },
      { name: 'Nickel', type: 'contact' },
      { name: 'Fragrance/Perfume', type: 'contact' },
      { name: 'Formaldehyde', type: 'contact' },
      { name: 'Parabens', type: 'contact' },
      { name: 'Lanolin', type: 'contact' },
      { name: 'Propylene Glycol', type: 'contact' },
      { name: 'Cobalt', type: 'contact' },
      { name: 'Balsam of Peru', type: 'contact' }
    ]
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapAllergySeverityToAlertSeverity(severity: AllergySeverity): AlertSeverity {
  switch (severity) {
    case 'life_threatening':
      return 'contraindicated';
    case 'severe':
      return 'critical';
    case 'moderate':
      return 'warning';
    case 'mild':
      return 'info';
    default:
      return 'warning';
  }
}

// Export the service object for convenience
export const allergyAlertService = {
  addAllergy,
  updateAllergy,
  getPatientAllergies,
  checkDrugAllergy,
  checkCrossReactivity,
  checkLatexAllergy,
  checkAdhesiveAllergy,
  getActiveAlerts,
  logAlertAction,
  getAlertHistory,
  verifyAllergy,
  deleteAllergy,
  getCommonDermatologyAllergies
};
