/**
 * Drug Interaction Checking Service
 *
 * Provides drug-drug interaction checking for prescription safety.
 * This is a mock implementation with common dermatology drug interactions.
 * In production, this would integrate with First Databank, Lexicomp, or similar services.
 */

import { pool } from '../db/pool';

export interface DrugInteraction {
  severity: 'severe' | 'moderate' | 'mild';
  description: string;
  medication1: string;
  medication2: string;
  clinicalEffects?: string;
  management?: string;
}

/**
 * Check for drug-drug interactions
 */
export async function checkDrugDrugInteractions(
  newMedicationName: string,
  patientId: string,
  tenantId: string
): Promise<DrugInteraction[]> {
  try {
    // Get patient's current active prescriptions
    const activeMeds = await pool.query(
      `SELECT DISTINCT medication_name, generic_name
       FROM prescriptions
       WHERE patient_id = $1
         AND tenant_id = $2
         AND status NOT IN ('cancelled', 'discontinued', 'error')
         AND (created_at > CURRENT_DATE - INTERVAL '6 months' OR refills > 0)
       ORDER BY created_at DESC`,
      [patientId, tenantId]
    );

    const interactions: DrugInteraction[] = [];

    // Check each active medication for interactions
    for (const med of activeMeds.rows) {
      const interaction = await checkSingleInteraction(
        newMedicationName,
        med.medication_name
      );

      if (interaction) {
        interactions.push(interaction);
      }
    }

    // Also check database for known interactions
    const dbInteractions = await checkDatabaseInteractions(
      newMedicationName,
      activeMeds.rows.map(m => m.medication_name)
    );

    interactions.push(...dbInteractions);

    return interactions;
  } catch (error) {
    console.error('Error checking drug interactions:', error);
    return [];
  }
}

/**
 * Check a single drug-drug interaction
 */
async function checkSingleInteraction(
  med1: string,
  med2: string
): Promise<DrugInteraction | null> {
  // Known dermatology drug interactions
  const interactions = getKnownInteractions();

  const med1Lower = med1.toLowerCase();
  const med2Lower = med2.toLowerCase();

  // Check both directions
  for (const interaction of interactions) {
    const drug1 = interaction.drug1.toLowerCase();
    const drug2 = interaction.drug2.toLowerCase();

    if (
      (med1Lower.includes(drug1) && med2Lower.includes(drug2)) ||
      (med1Lower.includes(drug2) && med2Lower.includes(drug1))
    ) {
      return {
        severity: interaction.severity,
        description: interaction.description,
        medication1: med1,
        medication2: med2,
        clinicalEffects: interaction.clinicalEffects,
        management: interaction.management,
      };
    }
  }

  return null;
}

/**
 * Check database for documented interactions
 */
async function checkDatabaseInteractions(
  newMed: string,
  currentMeds: string[]
): Promise<DrugInteraction[]> {
  if (currentMeds.length === 0) return [];

  try {
    const result = await pool.query(
      `SELECT * FROM drug_interactions
       WHERE (medication_1 = ANY($1) AND medication_2 ILIKE $2)
          OR (medication_2 = ANY($1) AND medication_1 ILIKE $2)
       ORDER BY CASE severity
         WHEN 'severe' THEN 1
         WHEN 'moderate' THEN 2
         WHEN 'mild' THEN 3
       END`,
      [currentMeds, `%${newMed}%`]
    );

    return result.rows.map((row: any) => ({
      severity: row.severity,
      description: row.description,
      medication1: row.medication_1,
      medication2: row.medication_2,
      clinicalEffects: row.clinical_effects,
      management: row.management,
    }));
  } catch (error) {
    console.error('Error querying drug interactions:', error);
    return [];
  }
}

/**
 * Known dermatology drug interactions (mock data)
 */
function getKnownInteractions() {
  return [
    // Isotretinoin interactions
    {
      drug1: 'isotretinoin',
      drug2: 'doxycycline',
      severity: 'severe' as const,
      description: 'Increased risk of pseudotumor cerebri (benign intracranial hypertension)',
      clinicalEffects: 'Headache, visual disturbances, papilledema',
      management: 'Avoid combination. Use alternative antibiotics if needed.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'minocycline',
      severity: 'severe' as const,
      description: 'Increased risk of pseudotumor cerebri',
      clinicalEffects: 'Headache, visual disturbances, papilledema',
      management: 'Avoid combination. Use alternative antibiotics.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'tetracycline',
      severity: 'severe' as const,
      description: 'Increased risk of pseudotumor cerebri',
      clinicalEffects: 'Severe headache, vision changes',
      management: 'Contraindicated. Do not use together.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'vitamin a',
      severity: 'severe' as const,
      description: 'Hypervitaminosis A',
      clinicalEffects: 'Hepatotoxicity, bone abnormalities, severe headaches',
      management: 'Avoid vitamin A supplements while on isotretinoin.',
    },
    {
      drug1: 'isotretinoin',
      drug2: 'methotrexate',
      severity: 'moderate' as const,
      description: 'Increased risk of hepatotoxicity',
      clinicalEffects: 'Elevated liver enzymes, liver damage',
      management: 'Monitor liver function tests closely if combination necessary.',
    },

    // Methotrexate interactions
    {
      drug1: 'methotrexate',
      drug2: 'trimethoprim',
      severity: 'severe' as const,
      description: 'Increased bone marrow suppression and toxicity',
      clinicalEffects: 'Pancytopenia, severe myelosuppression',
      management: 'Avoid combination or use with extreme caution.',
    },
    {
      drug1: 'methotrexate',
      drug2: 'nsaid',
      severity: 'moderate' as const,
      description: 'Decreased methotrexate elimination, increased toxicity',
      clinicalEffects: 'Bone marrow suppression, GI toxicity',
      management: 'Monitor closely. Consider dose adjustment.',
    },
    {
      drug1: 'methotrexate',
      drug2: 'ibuprofen',
      severity: 'moderate' as const,
      description: 'May increase methotrexate levels',
      clinicalEffects: 'Increased methotrexate toxicity',
      management: 'Use with caution. Monitor for toxicity.',
    },

    // Cyclosporine interactions
    {
      drug1: 'cyclosporine',
      drug2: 'ketoconazole',
      severity: 'severe' as const,
      description: 'Significantly increased cyclosporine levels',
      clinicalEffects: 'Nephrotoxicity, neurotoxicity',
      management: 'Reduce cyclosporine dose significantly. Monitor levels.',
    },
    {
      drug1: 'cyclosporine',
      drug2: 'fluconazole',
      severity: 'moderate' as const,
      description: 'Increased cyclosporine levels',
      clinicalEffects: 'Potential toxicity',
      management: 'Monitor cyclosporine levels and renal function.',
    },
    {
      drug1: 'cyclosporine',
      drug2: 'itraconazole',
      severity: 'severe' as const,
      description: 'Markedly increased cyclosporine concentrations',
      clinicalEffects: 'Nephrotoxicity, hypertension',
      management: 'Reduce cyclosporine dose. Monitor levels closely.',
    },

    // Warfarin interactions (for patients on anticoagulants)
    {
      drug1: 'warfarin',
      drug2: 'metronidazole',
      severity: 'severe' as const,
      description: 'Increased anticoagulant effect',
      clinicalEffects: 'Bleeding risk',
      management: 'Monitor INR closely. Adjust warfarin dose as needed.',
    },
    {
      drug1: 'warfarin',
      drug2: 'fluconazole',
      severity: 'severe' as const,
      description: 'Increased anticoagulant effect',
      clinicalEffects: 'Increased bleeding risk',
      management: 'Monitor INR. Reduce warfarin dose if needed.',
    },

    // Corticosteroid interactions
    {
      drug1: 'prednisone',
      drug2: 'nsaid',
      severity: 'moderate' as const,
      description: 'Increased risk of GI ulceration and bleeding',
      clinicalEffects: 'GI bleeding, peptic ulcers',
      management: 'Consider gastroprotection. Monitor for GI symptoms.',
    },

    // Tetracycline/doxycycline interactions
    {
      drug1: 'doxycycline',
      drug2: 'calcium',
      severity: 'mild' as const,
      description: 'Decreased absorption of tetracycline',
      clinicalEffects: 'Reduced antibiotic efficacy',
      management: 'Separate administration by 2-3 hours.',
    },
    {
      drug1: 'doxycycline',
      drug2: 'iron',
      severity: 'mild' as const,
      description: 'Decreased absorption of both drugs',
      clinicalEffects: 'Reduced efficacy',
      management: 'Separate administration by 2-3 hours.',
    },

    // Biologics
    {
      drug1: 'adalimumab',
      drug2: 'live vaccine',
      severity: 'severe' as const,
      description: 'Increased risk of infection from live vaccines',
      clinicalEffects: 'Vaccine-associated infection',
      management: 'Avoid live vaccines. Use inactivated vaccines only.',
    },
    {
      drug1: 'dupilumab',
      drug2: 'live vaccine',
      severity: 'moderate' as const,
      description: 'May reduce vaccine efficacy',
      clinicalEffects: 'Inadequate immune response',
      management: 'Complete vaccinations before starting therapy when possible.',
    },
  ];
}

/**
 * Check for drug-allergy interactions
 */
export async function checkDrugAllergyInteractions(
  medicationName: string,
  patientId: string,
  tenantId: string
): Promise<Array<{ allergen: string; severity: string; reaction: string }>> {
  try {
    const result = await pool.query(
      `SELECT allergen, severity, reaction
       FROM patient_allergies
       WHERE patient_id = $1
         AND tenant_id = $2
         AND status = 'active'
         AND allergen_type = 'medication'`,
      [patientId, tenantId]
    );

    const matches: Array<{ allergen: string; severity: string; reaction: string }> = [];

    const medLower = medicationName.toLowerCase();

    for (const allergy of result.rows) {
      const allergenLower = allergy.allergen.toLowerCase();

      // Check for exact or partial matches
      if (
        medLower.includes(allergenLower) ||
        allergenLower.includes(medLower) ||
        checkDrugClassMatch(medLower, allergenLower)
      ) {
        matches.push({
          allergen: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
        });
      }
    }

    return matches;
  } catch (error) {
    console.error('Error checking drug allergies:', error);
    return [];
  }
}

/**
 * Check if medications are in the same drug class
 */
function checkDrugClassMatch(med1: string, med2: string): boolean {
  const drugClasses = [
    ['penicillin', 'amoxicillin', 'ampicillin', 'dicloxacillin'],
    ['cephalosporin', 'cephalexin', 'cefazolin', 'ceftriaxone'],
    ['sulfa', 'sulfamethoxazole', 'trimethoprim', 'sulfasalazine'],
    ['tetracycline', 'doxycycline', 'minocycline'],
    ['quinolone', 'ciprofloxacin', 'levofloxacin', 'moxifloxacin'],
  ];

  for (const drugClass of drugClasses) {
    const med1InClass = drugClass.some(drug => med1.includes(drug));
    const med2InClass = drugClass.some(drug => med2.includes(drug));

    if (med1InClass && med2InClass) {
      return true;
    }
  }

  return false;
}

/**
 * Get comprehensive safety check for a medication
 */
export async function comprehensiveSafetyCheck(
  medicationName: string,
  patientId: string,
  tenantId: string
): Promise<{
  drugInteractions: DrugInteraction[];
  allergyWarnings: Array<{ allergen: string; severity: string; reaction: string }>;
  warnings: string[];
}> {
  const [drugInteractions, allergyWarnings] = await Promise.all([
    checkDrugDrugInteractions(medicationName, patientId, tenantId),
    checkDrugAllergyInteractions(medicationName, patientId, tenantId),
  ]);

  const warnings: string[] = [];

  // Add warnings based on interactions and allergies
  if (drugInteractions.length > 0) {
    const severeCount = drugInteractions.filter(i => i.severity === 'severe').length;
    if (severeCount > 0) {
      warnings.push(`${severeCount} severe drug interaction(s) detected`);
    }
  }

  if (allergyWarnings.length > 0) {
    warnings.push(`Patient has documented allergy to related medication`);
  }

  return {
    drugInteractions,
    allergyWarnings,
    warnings,
  };
}
