/**
 * Prescription Validation Service
 *
 * Validates prescriptions for regulatory compliance and clinical safety.
 * This is a stub implementation that will be enhanced with:
 * - Drug interaction checking (via First Databank or similar)
 * - Formulary checking (via payer APIs)
 * - Allergy checking (against patient allergies)
 * - DEA compliance for controlled substances
 */

export interface PrescriptionValidationRequest {
  medicationId?: string;
  medicationName: string;
  strength?: string;
  quantity: number;
  refills: number;
  daysSupply?: number;
  isControlled: boolean;
  deaSchedule?: string;
  patientId: string;
  providerId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  type: 'interaction' | 'allergy' | 'formulary' | 'dea' | 'clinical';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Validate a prescription before saving
 */
export function validatePrescription(
  prescription: PrescriptionValidationRequest
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required field validation
  if (!prescription.medicationName || prescription.medicationName.trim() === '') {
    errors.push({
      field: 'medicationName',
      message: 'Medication name is required',
      code: 'REQUIRED_FIELD',
    });
  }

  if (!prescription.quantity || prescription.quantity <= 0) {
    errors.push({
      field: 'quantity',
      message: 'Quantity must be greater than 0',
      code: 'INVALID_QUANTITY',
    });
  }

  if (prescription.refills < 0) {
    errors.push({
      field: 'refills',
      message: 'Refills cannot be negative',
      code: 'INVALID_REFILLS',
    });
  }

  if (prescription.refills > 5) {
    errors.push({
      field: 'refills',
      message: 'Refills cannot exceed 5',
      code: 'REFILLS_EXCEEDED',
    });
  }

  if (prescription.daysSupply && prescription.daysSupply < 1) {
    errors.push({
      field: 'daysSupply',
      message: 'Days supply must be at least 1 day',
      code: 'INVALID_DAYS_SUPPLY',
    });
  }

  if (prescription.daysSupply && prescription.daysSupply > 90) {
    warnings.push({
      type: 'clinical',
      message: 'Days supply exceeds 90 days. Consider if this is appropriate.',
      severity: 'medium',
    });
  }

  // Controlled substance validation
  if (prescription.isControlled) {
    validateControlledSubstance(prescription, errors, warnings);
  }

  // Quantity validation based on dosage form
  validateQuantityByDosageForm(prescription, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate controlled substance prescriptions (DEA requirements)
 */
function validateControlledSubstance(
  prescription: PrescriptionValidationRequest,
  errors: ValidationError[],
  warnings: ValidationWarning[]
): void {
  // Schedule II controlled substances have stricter requirements
  if (prescription.deaSchedule === 'II') {
    if (prescription.refills > 0) {
      errors.push({
        field: 'refills',
        message: 'Schedule II controlled substances cannot have refills',
        code: 'DEA_SCHEDULE_II_NO_REFILLS',
      });
    }

    if (prescription.quantity > 90) {
      warnings.push({
        type: 'dea',
        message:
          'Large quantity for Schedule II controlled substance. Ensure this is clinically appropriate and document medical necessity.',
        severity: 'high',
      });
    }
  }

  // Schedule III-V can have up to 5 refills within 6 months
  if (['III', 'IV', 'V'].includes(prescription.deaSchedule || '')) {
    if (prescription.refills > 5) {
      errors.push({
        field: 'refills',
        message: 'Schedule III-V controlled substances cannot have more than 5 refills',
        code: 'DEA_SCHEDULE_III_V_MAX_REFILLS',
      });
    }
  }

  // Days supply for controlled substances
  if (prescription.daysSupply && prescription.daysSupply > 30) {
    warnings.push({
      type: 'dea',
      message:
        'Controlled substance prescribed for more than 30 days. Verify state regulations and document medical necessity.',
      severity: 'high',
    });
  }
}

/**
 * Validate quantity based on typical dosage form
 */
function validateQuantityByDosageForm(
  prescription: PrescriptionValidationRequest,
  warnings: ValidationWarning[]
): void {
  const name = prescription.medicationName.toLowerCase();

  // Topical medications - typically in grams or ml
  if (name.includes('cream') || name.includes('ointment') || name.includes('gel')) {
    if (prescription.quantity > 120) {
      warnings.push({
        type: 'clinical',
        message:
          'Large quantity for topical medication. Typical tube sizes are 15g, 30g, 45g, or 60g.',
        severity: 'medium',
      });
    }
  }

  // Oral tablets/capsules
  if (name.includes('tablet') || name.includes('capsule')) {
    if (prescription.quantity > 180) {
      warnings.push({
        type: 'clinical',
        message:
          'Large quantity for oral medication. Verify this is appropriate for the treatment plan.',
        severity: 'medium',
      });
    }
  }

  // Biologics/injections - typically limited quantities
  if (name.includes('injection') || name.includes('syringe')) {
    if (prescription.quantity > 12) {
      warnings.push({
        type: 'clinical',
        message: 'Large quantity for injectable medication. Verify with patient care plan.',
        severity: 'high',
      });
    }
  }
}

/**
 * Check for drug interactions (STUB)
 * In production, this would integrate with First Databank or similar service
 */
export async function checkDrugInteractions(
  newMedicationId: string,
  patientId: string
): Promise<ValidationWarning[]> {
  // TODO: Integrate with drug interaction database
  // For now, return empty array
  console.log(
    `[STUB] Checking drug interactions for medication ${newMedicationId} and patient ${patientId}`
  );

  return [];
}

/**
 * Check formulary coverage (STUB)
 * In production, this would check against patient's insurance formulary
 */
export async function checkFormulary(
  medicationId: string,
  patientId: string
): Promise<{ covered: boolean; tier?: string; priorAuthRequired?: boolean }> {
  // TODO: Integrate with insurance formulary checking
  // For now, assume all medications are covered
  console.log(
    `[STUB] Checking formulary coverage for medication ${medicationId} and patient ${patientId}`
  );

  return {
    covered: true,
    tier: 'Unknown',
    priorAuthRequired: false,
  };
}

/**
 * Check for allergies (STUB)
 * In production, this would check against patient's allergy list
 */
export async function checkAllergies(
  medicationName: string,
  patientId: string
): Promise<ValidationWarning[]> {
  // TODO: Check patient allergies in database and cross-reference with medication
  // For now, return empty array
  console.log(
    `[STUB] Checking allergies for medication ${medicationName} and patient ${patientId}`
  );

  return [];
}

/**
 * Validate provider can prescribe controlled substances
 * In production, would verify DEA license and state requirements
 */
export function canProviderPrescribeControlled(
  providerId: string,
  deaSchedule?: string
): boolean {
  // TODO: Check provider's DEA license status and number
  // For now, assume all providers can prescribe
  console.log(
    `[STUB] Checking if provider ${providerId} can prescribe DEA schedule ${deaSchedule || 'N/A'}`
  );

  return true;
}
