/**
 * Drug Interaction Checking Service
 *
 * Comprehensive drug interaction checking system including:
 * - Drug-drug interactions
 * - Drug-allergy cross-reactivity
 * - Duplicate therapy detection
 * - Black box warnings and precautions
 * - OpenFDA API integration
 */

import { pool } from '../db/pool';
import { logger } from '../lib/logger';

// =============================================================================
// Type Definitions
// =============================================================================

export type InteractionSeverity = 'contraindicated' | 'major' | 'moderate' | 'minor';
export type AlertType =
  | 'drug_interaction'
  | 'allergy_warning'
  | 'duplicate_therapy'
  | 'black_box_warning'
  | 'contraindication'
  | 'dose_warning'
  | 'pregnancy_warning'
  | 'pediatric_warning'
  | 'geriatric_warning'
  | 'renal_warning'
  | 'hepatic_warning';

export interface DrugInteraction {
  id?: string;
  severity: InteractionSeverity;
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
  mechanism?: string;
  onset?: string;
  source?: string;
  dermatologyRelevance?: number;
}

export interface AllergyWarning {
  allergen: string;
  severity: string;
  reaction: string;
  allergyClass?: string;
  crossReactivityNotes?: string;
  crossReactivityRate?: number;
  alternatives?: string[];
}

export interface DuplicateTherapyAlert {
  existingDrug: string;
  newDrug: string;
  therapeuticClass: string;
  pharmacologicClass?: string;
  recommendation: string;
}

export interface DrugWarning {
  type: 'black_box' | 'precaution' | 'contraindication';
  title: string;
  description: string;
  source?: string;
}

export interface DrugAlert {
  id?: string;
  patientId: string;
  drugName: string;
  interactingDrugName?: string;
  alertType: AlertType;
  severity: InteractionSeverity | 'info';
  title: string;
  message: string;
  clinicalSignificance?: string;
  recommendation?: string;
  sourceInteractionId?: string;
  sourceAllergyClassId?: string;
  metadata?: Record<string, unknown>;
}

export interface ComprehensiveSafetyCheck {
  drugInteractions: DrugInteraction[];
  allergyWarnings: AllergyWarning[];
  duplicateTherapyAlerts: DuplicateTherapyAlert[];
  drugWarnings: DrugWarning[];
  alerts: DrugAlert[];
  hasCriticalAlerts: boolean;
  hasContraindicated: boolean;
  summary: {
    totalAlerts: number;
    contraindicatedCount: number;
    majorCount: number;
    moderateCount: number;
    minorCount: number;
  };
}

export interface DrugInfo {
  id?: string;
  rxnormCui?: string;
  ndcCode?: string;
  drugName: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: string;
  strength?: string;
  route?: string;
  deaSchedule?: string;
  isControlled?: boolean;
  blackBoxWarning?: string;
  contraindications?: Array<{ condition: string; severity: string }>;
  precautions?: Array<{ condition: string; description: string }>;
  commonSideEffects?: string[];
  seriousAdverseEffects?: string[];
  monitoringParameters?: string[];
  pregnancyCategory?: string;
  lactationRisk?: string;
  pediatricUseNotes?: string;
  geriatricUseNotes?: string;
  renalDosingNotes?: string;
  hepaticDosingNotes?: string;
}

export interface DrugSearchResult {
  id: string;
  rxnormCui?: string;
  ndcCode?: string;
  drugName: string;
  genericName?: string;
  drugClass?: string;
  dosageForm?: string;
  strength?: string;
  isControlled?: boolean;
  deaSchedule?: string;
  isDermatologyCommon?: boolean;
}

// =============================================================================
// Drug Interaction Checking
// =============================================================================

/**
 * Check for drug-drug interactions between a new drug and patient's current medications
 */
export async function checkInteractions(
  patientId: string,
  newDrugRxcui: string,
  tenantId: string
): Promise<DrugInteraction[]> {
  try {
    // Get patient's current active prescriptions
    const activeMedsResult = await pool.query(
      `SELECT DISTINCT
         p.medication_name,
         p.generic_name,
         m.rxnorm_cui
       FROM prescriptions p
       LEFT JOIN medications m ON p.medication_id = m.id
       WHERE p.patient_id = $1
         AND p.tenant_id = $2
         AND p.status NOT IN ('cancelled', 'discontinued', 'error')
         AND (p.created_at > CURRENT_DATE - INTERVAL '6 months' OR p.refills > 0)
       ORDER BY p.created_at DESC`,
      [patientId, tenantId]
    );

    const activeMeds = activeMedsResult.rows;
    const interactions: DrugInteraction[] = [];

    if (activeMeds.length === 0) {
      return interactions;
    }

    // Get the new drug's name
    const newDrugResult = await pool.query(
      `SELECT drug_name, generic_name FROM drug_database WHERE rxnorm_cui = $1 LIMIT 1`,
      [newDrugRxcui]
    );
    const newDrugName = newDrugResult.rows[0]?.drug_name || newDrugRxcui;

    // Check database for known interactions
    const currentRxcuis = activeMeds
      .map(m => m.rxnorm_cui)
      .filter((r): r is string => r !== null && r !== undefined);

    if (currentRxcuis.length > 0) {
      const dbInteractions = await pool.query(
        `SELECT * FROM drug_interactions
         WHERE (drug1_rxcui = $1 AND drug2_rxcui = ANY($2))
            OR (drug2_rxcui = $1 AND drug1_rxcui = ANY($2))
         ORDER BY
           CASE severity
             WHEN 'contraindicated' THEN 1
             WHEN 'major' THEN 2
             WHEN 'moderate' THEN 3
             WHEN 'minor' THEN 4
           END,
           dermatology_relevance DESC`,
        [newDrugRxcui, currentRxcuis]
      );

      for (const row of dbInteractions.rows) {
        interactions.push({
          id: row.id,
          severity: row.severity as InteractionSeverity,
          description: row.description,
          medication1: row.drug1_name,
          medication2: row.drug2_name,
          clinicalEffects: row.clinical_effects,
          management: row.management,
          mechanism: row.mechanism,
          onset: row.onset,
          source: row.source,
          dermatologyRelevance: row.dermatology_relevance,
        });
      }
    }

    // Also check by drug name for medications without RxCUI
    const currentMedNames = activeMeds.map(m => m.medication_name?.toLowerCase() || '');
    const nameBasedInteractions = await checkNameBasedInteractions(newDrugName, currentMedNames);

    // Merge, avoiding duplicates
    for (const interaction of nameBasedInteractions) {
      const isDuplicate = interactions.some(
        i =>
          i.medication1.toLowerCase() === interaction.medication1.toLowerCase() &&
          i.medication2.toLowerCase() === interaction.medication2.toLowerCase()
      );
      if (!isDuplicate) {
        interactions.push(interaction);
      }
    }

    return interactions;
  } catch (error) {
    logger.error('Error checking drug interactions', { error, patientId, newDrugRxcui });
    return [];
  }
}

/**
 * Check interactions by drug name matching (fallback for drugs without RxCUI)
 */
async function checkNameBasedInteractions(
  newDrugName: string,
  currentMedNames: string[]
): Promise<DrugInteraction[]> {
  const interactions: DrugInteraction[] = [];
  const newDrugLower = newDrugName.toLowerCase();

  // Known dermatology drug interactions (hardcoded for reliability)
  const knownInteractions = getKnownDermatologyInteractions();

  for (const currentMed of currentMedNames) {
    for (const known of knownInteractions) {
      const drug1Lower = known.drug1.toLowerCase();
      const drug2Lower = known.drug2.toLowerCase();

      const match1 = newDrugLower.includes(drug1Lower) && currentMed.includes(drug2Lower);
      const match2 = newDrugLower.includes(drug2Lower) && currentMed.includes(drug1Lower);

      if (match1 || match2) {
        interactions.push({
          severity: known.severity,
          description: known.description,
          medication1: newDrugName,
          medication2: currentMed,
          clinicalEffects: known.clinicalEffects,
          management: known.management,
        });
      }
    }
  }

  return interactions;
}

/**
 * Known dermatology drug interactions (reliable fallback data)
 */
function getKnownDermatologyInteractions(): Array<{
  drug1: string;
  drug2: string;
  severity: InteractionSeverity;
  description: string;
  clinicalEffects?: string;
  management?: string;
}> {
  return [
    // Isotretinoin + Tetracyclines
    {
      drug1: 'isotretinoin',
      drug2: 'doxycycline',
      severity: 'contraindicated',
      description: 'Increased risk of pseudotumor cerebri (idiopathic intracranial hypertension)',
      clinicalEffects: 'Severe headache, papilledema, visual disturbances, potential permanent vision loss',
      management: 'AVOID combination. Use non-tetracycline antibiotics if needed.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'minocycline',
      severity: 'contraindicated',
      description: 'Increased risk of pseudotumor cerebri',
      clinicalEffects: 'Headache, visual disturbances, papilledema',
      management: 'AVOID combination. Select alternative antibiotic.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'tetracycline',
      severity: 'contraindicated',
      description: 'Increased risk of pseudotumor cerebri',
      clinicalEffects: 'Severe headache, vision changes',
      management: 'CONTRAINDICATED. Do not use together.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'vitamin a',
      severity: 'major',
      description: 'Risk of hypervitaminosis A',
      clinicalEffects: 'Hepatotoxicity, bone abnormalities, severe headaches',
      management: 'Avoid vitamin A supplements while on isotretinoin.',
    },
    // Methotrexate interactions
    {
      drug1: 'methotrexate',
      drug2: 'trimethoprim',
      severity: 'contraindicated',
      description: 'Increased bone marrow suppression and toxicity',
      clinicalEffects: 'Pancytopenia, severe myelosuppression',
      management: 'AVOID combination or use with extreme caution.',
    },
    {
      drug1: 'methotrexate',
      drug2: 'bactrim',
      severity: 'contraindicated',
      description: 'Trimethoprim-sulfamethoxazole potentiates methotrexate toxicity',
      clinicalEffects: 'Severe myelosuppression, pancytopenia',
      management: 'CONTRAINDICATED. Choose alternative antibiotic.',
    },
    {
      drug1: 'methotrexate',
      drug2: 'nsaid',
      severity: 'major',
      description: 'Decreased methotrexate elimination, increased toxicity',
      clinicalEffects: 'Bone marrow suppression, GI toxicity',
      management: 'Monitor closely. Consider dose adjustment.',
    },
    {
      drug1: 'methotrexate',
      drug2: 'ibuprofen',
      severity: 'major',
      description: 'May increase methotrexate levels',
      clinicalEffects: 'Increased methotrexate toxicity',
      management: 'Use with caution. Monitor for toxicity.',
    },
    // Spironolactone + Potassium
    {
      drug1: 'spironolactone',
      drug2: 'potassium',
      severity: 'major',
      description: 'Additive hyperkalemia risk',
      clinicalEffects: 'Dangerous hyperkalemia, cardiac arrhythmias',
      management: 'Monitor potassium closely. Avoid potassium supplements.',
    },
    // Cyclosporine interactions
    {
      drug1: 'cyclosporine',
      drug2: 'ketoconazole',
      severity: 'major',
      description: 'Significantly increased cyclosporine levels',
      clinicalEffects: 'Nephrotoxicity, neurotoxicity',
      management: 'Reduce cyclosporine dose significantly. Monitor levels.',
    },
    {
      drug1: 'cyclosporine',
      drug2: 'itraconazole',
      severity: 'major',
      description: 'Markedly increased cyclosporine concentrations',
      clinicalEffects: 'Nephrotoxicity, hypertension',
      management: 'Reduce cyclosporine dose. Monitor levels closely.',
    },
    // Biologics + Live vaccines
    {
      drug1: 'adalimumab',
      drug2: 'live vaccine',
      severity: 'contraindicated',
      description: 'Increased risk of infection from live vaccines',
      clinicalEffects: 'Vaccine-associated infection',
      management: 'Avoid live vaccines. Use inactivated vaccines only.',
    },
    {
      drug1: 'humira',
      drug2: 'live vaccine',
      severity: 'contraindicated',
      description: 'Increased risk of infection from live vaccines',
      clinicalEffects: 'Vaccine-associated infection',
      management: 'Avoid live vaccines during biologic therapy.',
    },
    {
      drug1: 'dupilumab',
      drug2: 'live vaccine',
      severity: 'moderate',
      description: 'May reduce vaccine efficacy',
      clinicalEffects: 'Inadequate immune response',
      management: 'Complete vaccinations before starting therapy when possible.',
    },
  ];
}

// =============================================================================
// Drug-Allergy Cross-Reactivity Checking
// =============================================================================

/**
 * Check for drug-allergy cross-reactivity
 */
export async function checkAllergies(
  patientId: string,
  drugRxcui: string,
  tenantId: string
): Promise<AllergyWarning[]> {
  try {
    // Get patient's documented allergies
    const allergiesResult = await pool.query(
      `SELECT allergen, severity, reaction, allergen_type
       FROM patient_allergies
       WHERE patient_id = $1
         AND tenant_id = $2
         AND status = 'active'
         AND allergen_type = 'medication'`,
      [patientId, tenantId]
    );

    if (allergiesResult.rows.length === 0) {
      return [];
    }

    // Get the drug information
    const drugResult = await pool.query(
      `SELECT drug_name, generic_name, drug_class FROM drug_database
       WHERE rxnorm_cui = $1
       LIMIT 1`,
      [drugRxcui]
    );

    const drugInfo = drugResult.rows[0];
    if (!drugInfo) {
      return [];
    }

    const warnings: AllergyWarning[] = [];
    const drugNameLower = drugInfo.drug_name?.toLowerCase() || '';
    const genericNameLower = drugInfo.generic_name?.toLowerCase() || '';
    const drugClassLower = drugInfo.drug_class?.toLowerCase() || '';

    for (const allergy of allergiesResult.rows) {
      const allergenLower = allergy.allergen.toLowerCase();

      // Direct match
      if (
        drugNameLower.includes(allergenLower) ||
        genericNameLower.includes(allergenLower) ||
        allergenLower.includes(drugNameLower) ||
        allergenLower.includes(genericNameLower)
      ) {
        warnings.push({
          allergen: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
          alternatives: [],
        });
        continue;
      }

      // Check drug class cross-reactivity
      const classMatchResult = await pool.query(
        `SELECT * FROM drug_allergy_classes
         WHERE $1 = ANY(related_drugs) OR allergy_class ILIKE $2`,
        [allergenLower, `%${allergenLower}%`]
      );

      for (const classMatch of classMatchResult.rows) {
        const relatedDrugs: string[] = classMatch.related_drugs || [];
        const isRelated = relatedDrugs.some(
          drug =>
            drugNameLower.includes(drug.toLowerCase()) ||
            genericNameLower.includes(drug.toLowerCase())
        );

        if (isRelated) {
          warnings.push({
            allergen: allergy.allergen,
            severity: allergy.severity,
            reaction: allergy.reaction,
            allergyClass: classMatch.class_display_name,
            crossReactivityNotes: classMatch.cross_reactivity_notes,
            crossReactivityRate: parseFloat(classMatch.cross_reactivity_rate) || undefined,
            alternatives: classMatch.alternative_suggestions || [],
          });
        }
      }
    }

    return warnings;
  } catch (error) {
    logger.error('Error checking drug allergies', { error, patientId, drugRxcui });
    return [];
  }
}

// =============================================================================
// Duplicate Therapy Detection
// =============================================================================

/**
 * Check for duplicate therapy (same therapeutic class)
 */
export async function checkDuplicateTherapy(
  patientId: string,
  drugClass: string,
  newDrugName: string,
  tenantId: string
): Promise<DuplicateTherapyAlert[]> {
  try {
    const alerts: DuplicateTherapyAlert[] = [];

    // Get patient's current medications in the same therapeutic class
    const result = await pool.query(
      `SELECT DISTINCT
         p.medication_name,
         p.generic_name,
         dcm.therapeutic_class,
         dcm.pharmacologic_class
       FROM prescriptions p
       LEFT JOIN drug_class_mapping dcm ON (
         LOWER(p.medication_name) LIKE '%' || LOWER(dcm.drug_name) || '%'
         OR LOWER(p.generic_name) LIKE '%' || LOWER(dcm.drug_name) || '%'
       )
       WHERE p.patient_id = $1
         AND p.tenant_id = $2
         AND p.status NOT IN ('cancelled', 'discontinued', 'error')
         AND dcm.therapeutic_class = $3
         AND p.medication_name NOT ILIKE $4
       ORDER BY p.created_at DESC`,
      [patientId, tenantId, drugClass, `%${newDrugName}%`]
    );

    for (const row of result.rows) {
      alerts.push({
        existingDrug: row.medication_name,
        newDrug: newDrugName,
        therapeuticClass: row.therapeutic_class,
        pharmacologicClass: row.pharmacologic_class,
        recommendation: `Patient is already on ${row.medication_name} (${row.therapeutic_class}). Consider whether duplicate therapy is clinically indicated.`,
      });
    }

    return alerts;
  } catch (error) {
    logger.error('Error checking duplicate therapy', { error, patientId, drugClass });
    return [];
  }
}

// =============================================================================
// Drug Warnings (Black Box, Precautions)
// =============================================================================

/**
 * Get drug warnings including black box warnings and precautions
 */
export async function getDrugWarnings(rxcui: string): Promise<DrugWarning[]> {
  const warnings: DrugWarning[] = [];

  try {
    // Check database first
    const dbResult = await pool.query(
      `SELECT black_box_warning, contraindications, precautions
       FROM drug_database
       WHERE rxnorm_cui = $1
       LIMIT 1`,
      [rxcui]
    );

    if (dbResult.rows.length > 0) {
      const drug = dbResult.rows[0];

      if (drug.black_box_warning) {
        warnings.push({
          type: 'black_box',
          title: 'Black Box Warning',
          description: drug.black_box_warning,
          source: 'FDA',
        });
      }

      const contraindications = drug.contraindications as Array<{ condition: string; severity: string }> || [];
      for (const ci of contraindications) {
        warnings.push({
          type: 'contraindication',
          title: `Contraindication: ${ci.condition}`,
          description: ci.condition,
          source: 'Database',
        });
      }

      const precautions = drug.precautions as Array<{ condition: string; description: string }> || [];
      for (const prec of precautions) {
        warnings.push({
          type: 'precaution',
          title: `Precaution: ${prec.condition}`,
          description: prec.description,
          source: 'Database',
        });
      }
    }

    // Try OpenFDA API for additional warnings
    try {
      const openFdaWarnings = await fetchOpenFDAWarnings(rxcui);
      for (const warning of openFdaWarnings) {
        // Avoid duplicates
        const isDuplicate = warnings.some(
          w => w.type === warning.type && w.description === warning.description
        );
        if (!isDuplicate) {
          warnings.push(warning);
        }
      }
    } catch (openFdaError) {
      // OpenFDA is optional - log but don't fail
      logger.debug('OpenFDA lookup failed', { rxcui, error: openFdaError });
    }

    return warnings;
  } catch (error) {
    logger.error('Error getting drug warnings', { error, rxcui });
    return warnings;
  }
}

/**
 * Fetch warnings from OpenFDA API
 */
async function fetchOpenFDAWarnings(rxcui: string): Promise<DrugWarning[]> {
  const warnings: DrugWarning[] = [];

  try {
    // Get drug name from our database for OpenFDA lookup
    const drugResult = await pool.query(
      `SELECT drug_name, generic_name FROM drug_database WHERE rxnorm_cui = $1 LIMIT 1`,
      [rxcui]
    );

    if (drugResult.rows.length === 0) {
      return warnings;
    }

    const drugName = drugResult.rows[0].generic_name || drugResult.rows[0].drug_name;
    const encodedName = encodeURIComponent(drugName);

    // OpenFDA drug label endpoint
    const response = await fetch(
      `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodedName}"&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return warnings;
    }

    const data = await response.json() as { results?: Array<{
      boxed_warning?: string[];
      contraindications?: string[];
      warnings?: string[];
    }> };
    const result = data.results?.[0];

    if (!result) {
      return warnings;
    }

    // Extract black box warning
    if (result.boxed_warning && result.boxed_warning.length > 0) {
      warnings.push({
        type: 'black_box',
        title: 'FDA Black Box Warning',
        description: result.boxed_warning.join(' '),
        source: 'OpenFDA',
      });
    }

    // Extract contraindications
    if (result.contraindications && result.contraindications.length > 0) {
      warnings.push({
        type: 'contraindication',
        title: 'Contraindications',
        description: result.contraindications.join(' ').substring(0, 1000),
        source: 'OpenFDA',
      });
    }

    // Extract warnings
    if (result.warnings && result.warnings.length > 0) {
      warnings.push({
        type: 'precaution',
        title: 'Warnings',
        description: result.warnings.join(' ').substring(0, 1000),
        source: 'OpenFDA',
      });
    }

    return warnings;
  } catch (error) {
    // OpenFDA is best-effort
    logger.debug('OpenFDA fetch failed', { rxcui, error });
    return warnings;
  }
}

// =============================================================================
// Comprehensive Safety Check
// =============================================================================

/**
 * Perform comprehensive safety check for a medication
 */
export async function comprehensiveSafetyCheck(
  patientId: string,
  drugRxcui: string,
  drugName: string,
  tenantId: string
): Promise<ComprehensiveSafetyCheck> {
  // Run all checks in parallel for performance
  const [drugInteractions, allergyWarnings, drugWarnings] = await Promise.all([
    checkInteractions(patientId, drugRxcui, tenantId),
    checkAllergies(patientId, drugRxcui, tenantId),
    getDrugWarnings(drugRxcui),
  ]);

  // Get drug class for duplicate therapy check
  const drugClassResult = await pool.query(
    `SELECT therapeutic_class FROM drug_class_mapping
     WHERE LOWER(drug_name) = LOWER($1) OR rxnorm_cui = $2
     LIMIT 1`,
    [drugName, drugRxcui]
  );
  const drugClass = drugClassResult.rows[0]?.therapeutic_class;

  let duplicateTherapyAlerts: DuplicateTherapyAlert[] = [];
  if (drugClass) {
    duplicateTherapyAlerts = await checkDuplicateTherapy(patientId, drugClass, drugName, tenantId);
  }

  // Build unified alerts array
  const alerts: DrugAlert[] = [];

  // Add interaction alerts
  for (const interaction of drugInteractions) {
    alerts.push({
      patientId,
      drugName,
      interactingDrugName: interaction.medication2,
      alertType: 'drug_interaction',
      severity: interaction.severity,
      title: `Drug Interaction: ${interaction.medication1} + ${interaction.medication2}`,
      message: interaction.description,
      clinicalSignificance: interaction.clinicalEffects,
      recommendation: interaction.management,
      sourceInteractionId: interaction.id,
    });
  }

  // Add allergy alerts
  for (const allergy of allergyWarnings) {
    alerts.push({
      patientId,
      drugName,
      alertType: 'allergy_warning',
      severity: allergy.severity === 'severe' ? 'contraindicated' : 'major',
      title: `Allergy Warning: ${allergy.allergen}`,
      message: `Patient has documented allergy to ${allergy.allergen}. Reaction: ${allergy.reaction}`,
      clinicalSignificance: allergy.crossReactivityNotes,
      recommendation:
        allergy.alternatives && allergy.alternatives.length > 0
          ? `Consider alternatives: ${allergy.alternatives.join(', ')}`
          : 'Select an alternative medication.',
      sourceAllergyClassId: undefined,
      metadata: { allergyClass: allergy.allergyClass, crossReactivityRate: allergy.crossReactivityRate },
    });
  }

  // Add duplicate therapy alerts
  for (const duplicate of duplicateTherapyAlerts) {
    alerts.push({
      patientId,
      drugName,
      alertType: 'duplicate_therapy',
      severity: 'moderate',
      title: `Duplicate Therapy: ${duplicate.therapeuticClass}`,
      message: duplicate.recommendation,
      metadata: { existingDrug: duplicate.existingDrug, therapeuticClass: duplicate.therapeuticClass },
    });
  }

  // Add drug warnings
  for (const warning of drugWarnings) {
    const alertType: AlertType =
      warning.type === 'black_box'
        ? 'black_box_warning'
        : warning.type === 'contraindication'
          ? 'contraindication'
          : 'dose_warning';

    alerts.push({
      patientId,
      drugName,
      alertType,
      severity: warning.type === 'black_box' ? 'major' : 'moderate',
      title: warning.title,
      message: warning.description,
    });
  }

  // Calculate summary
  const contraindicatedCount = alerts.filter(a => a.severity === 'contraindicated').length;
  const majorCount = alerts.filter(a => a.severity === 'major').length;
  const moderateCount = alerts.filter(a => a.severity === 'moderate').length;
  const minorCount = alerts.filter(a => a.severity === 'minor').length;

  return {
    drugInteractions,
    allergyWarnings,
    duplicateTherapyAlerts,
    drugWarnings,
    alerts,
    hasCriticalAlerts: contraindicatedCount > 0 || majorCount > 0 || allergyWarnings.length > 0,
    hasContraindicated: contraindicatedCount > 0,
    summary: {
      totalAlerts: alerts.length,
      contraindicatedCount,
      majorCount,
      moderateCount,
      minorCount,
    },
  };
}

// =============================================================================
// Patient Alert Management
// =============================================================================

/**
 * Create a patient drug alert record
 */
export async function createPatientAlert(
  alert: DrugAlert,
  tenantId: string,
  encounterId?: string,
  prescriptionId?: string
): Promise<string> {
  try {
    const result = await pool.query(
      `INSERT INTO patient_drug_alerts (
        tenant_id, patient_id, encounter_id, prescription_id,
        drug_name, interacting_drug_name, alert_type, severity,
        alert_title, alert_message, clinical_significance, recommendation,
        source_interaction_id, source_allergy_class_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        tenantId,
        alert.patientId,
        encounterId || null,
        prescriptionId || null,
        alert.drugName,
        alert.interactingDrugName || null,
        alert.alertType,
        alert.severity,
        alert.title,
        alert.message,
        alert.clinicalSignificance || null,
        alert.recommendation || null,
        alert.sourceInteractionId || null,
        alert.sourceAllergyClassId || null,
        JSON.stringify(alert.metadata || {}),
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    logger.error('Error creating patient drug alert', { error, alert });
    throw error;
  }
}

/**
 * Acknowledge a patient drug alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string,
  tenantId: string,
  override: boolean = false,
  overrideReason?: string
): Promise<void> {
  try {
    await pool.query(
      `UPDATE patient_drug_alerts
       SET acknowledged_by = $1,
           acknowledged_at = NOW(),
           was_overridden = $2,
           override_reason = $3,
           updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [userId, override, overrideReason || null, alertId, tenantId]
    );
  } catch (error) {
    logger.error('Error acknowledging drug alert', { error, alertId, userId });
    throw error;
  }
}

/**
 * Get patient's active drug alerts
 */
export async function getPatientAlerts(
  patientId: string,
  tenantId: string,
  includeAcknowledged: boolean = false
): Promise<Array<DrugAlert & { id: string; acknowledgedBy?: string; acknowledgedAt?: Date }>> {
  try {
    let query = `
      SELECT
        pda.*,
        u.full_name as acknowledged_by_name
      FROM patient_drug_alerts pda
      LEFT JOIN users u ON pda.acknowledged_by = u.id
      WHERE pda.patient_id = $1
        AND pda.tenant_id = $2
        AND pda.is_active = true
    `;

    if (!includeAcknowledged) {
      query += ` AND pda.acknowledged_at IS NULL`;
    }

    query += ` ORDER BY
      CASE pda.severity
        WHEN 'contraindicated' THEN 1
        WHEN 'major' THEN 2
        WHEN 'moderate' THEN 3
        WHEN 'minor' THEN 4
        ELSE 5
      END,
      pda.created_at DESC`;

    const result = await pool.query(query, [patientId, tenantId]);

    return result.rows.map(row => ({
      id: row.id,
      patientId: row.patient_id,
      drugName: row.drug_name,
      interactingDrugName: row.interacting_drug_name,
      alertType: row.alert_type,
      severity: row.severity,
      title: row.alert_title,
      message: row.alert_message,
      clinicalSignificance: row.clinical_significance,
      recommendation: row.recommendation,
      sourceInteractionId: row.source_interaction_id,
      sourceAllergyClassId: row.source_allergy_class_id,
      metadata: row.metadata,
      acknowledgedBy: row.acknowledged_by_name,
      acknowledgedAt: row.acknowledged_at,
    }));
  } catch (error) {
    logger.error('Error getting patient alerts', { error, patientId });
    return [];
  }
}

// =============================================================================
// Drug Database Search
// =============================================================================

/**
 * Search drug database
 */
export async function searchDrugs(
  query: string,
  tenantId?: string,
  limit: number = 20
): Promise<DrugSearchResult[]> {
  try {
    const searchQuery = `%${query}%`;

    const result = await pool.query(
      `SELECT
        id,
        rxnorm_cui,
        ndc_code,
        drug_name,
        generic_name,
        drug_class,
        dosage_form,
        strength,
        is_controlled,
        dea_schedule,
        is_dermatology_common
       FROM drug_database
       WHERE (
         drug_name ILIKE $1
         OR generic_name ILIKE $1
         OR ndc_code ILIKE $1
         OR rxnorm_cui ILIKE $1
       )
       ORDER BY
         is_dermatology_common DESC,
         CASE WHEN drug_name ILIKE $2 THEN 0 ELSE 1 END,
         drug_name
       LIMIT $3`,
      [searchQuery, `${query}%`, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      rxnormCui: row.rxnorm_cui,
      ndcCode: row.ndc_code,
      drugName: row.drug_name,
      genericName: row.generic_name,
      drugClass: row.drug_class,
      dosageForm: row.dosage_form,
      strength: row.strength,
      isControlled: row.is_controlled,
      deaSchedule: row.dea_schedule,
      isDermatologyCommon: row.is_dermatology_common,
    }));
  } catch (error) {
    logger.error('Error searching drugs', { error, query });
    return [];
  }
}

/**
 * Get drug information by RxCUI
 */
export async function getDrugInfo(rxcui: string): Promise<DrugInfo | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM drug_database WHERE rxnorm_cui = $1 LIMIT 1`,
      [rxcui]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      rxnormCui: row.rxnorm_cui,
      ndcCode: row.ndc_code,
      drugName: row.drug_name,
      genericName: row.generic_name,
      drugClass: row.drug_class,
      dosageForm: row.dosage_form,
      strength: row.strength,
      route: row.route,
      deaSchedule: row.dea_schedule,
      isControlled: row.is_controlled,
      blackBoxWarning: row.black_box_warning,
      contraindications: row.contraindications,
      precautions: row.precautions,
      commonSideEffects: row.common_side_effects,
      seriousAdverseEffects: row.serious_adverse_effects,
      monitoringParameters: row.monitoring_parameters,
      pregnancyCategory: row.pregnancy_category,
      lactationRisk: row.lactation_risk,
      pediatricUseNotes: row.pediatric_use_notes,
      geriatricUseNotes: row.geriatric_use_notes,
      renalDosingNotes: row.renal_dosing_notes,
      hepaticDosingNotes: row.hepatic_dosing_notes,
    };
  } catch (error) {
    logger.error('Error getting drug info', { error, rxcui });
    return null;
  }
}

// =============================================================================
// Legacy Exports (for backward compatibility)
// =============================================================================

/**
 * Legacy function for checking drug-drug interactions
 * @deprecated Use checkInteractions instead
 */
export async function checkDrugDrugInteractions(
  newMedicationName: string,
  patientId: string,
  tenantId: string
): Promise<DrugInteraction[]> {
  // Try to find RxCUI for the medication name
  const drugResult = await pool.query(
    `SELECT rxnorm_cui FROM drug_database WHERE drug_name ILIKE $1 OR generic_name ILIKE $1 LIMIT 1`,
    [`%${newMedicationName}%`]
  );

  const rxcui = drugResult.rows[0]?.rxnorm_cui || newMedicationName;
  return checkInteractions(patientId, rxcui, tenantId);
}

/**
 * Legacy function for checking drug-allergy interactions
 * @deprecated Use checkAllergies instead
 */
export async function checkDrugAllergyInteractions(
  medicationName: string,
  patientId: string,
  tenantId: string
): Promise<AllergyWarning[]> {
  const drugResult = await pool.query(
    `SELECT rxnorm_cui FROM drug_database WHERE drug_name ILIKE $1 OR generic_name ILIKE $1 LIMIT 1`,
    [`%${medicationName}%`]
  );

  const rxcui = drugResult.rows[0]?.rxnorm_cui || medicationName;
  return checkAllergies(patientId, rxcui, tenantId);
}
