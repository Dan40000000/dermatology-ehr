import { pool } from "../db/pool";
import crypto from "crypto";

/**
 * Cost Estimator Service
 * Estimates patient responsibility BEFORE service
 * Helps set expectations and improve collections
 */

export interface InsuranceBenefits {
  planName: string;
  deductible: number;
  deductibleMet: number;
  deductibleRemaining: number;
  coinsurancePercent: number;
  copay: number;
  outOfPocketMax: number;
  outOfPocketMet: number;
  isInNetwork: boolean;
}

export interface CostEstimate {
  id: string;
  patientId: string;
  appointmentId?: string;
  serviceType: string;
  totalCharges: number;
  insuranceAllowedAmount: number;
  insurancePays: number;
  patientResponsibility: number;
  breakdown: {
    copay: number;
    deductible: number;
    coinsurance: number;
    notCovered: number;
  };
  isCosmetic: boolean;
  insuranceVerified: boolean;
  validUntil: string;
}

/**
 * Get patient's insurance benefits
 */
export async function getInsuranceBenefits(
  tenantId: string,
  patientId: string
): Promise<InsuranceBenefits | null> {
  const result = await pool.query(
    `select
      insurance_name as "planName",
      insurance_deductible as deductible,
      insurance_coinsurance_percent as "coinsurancePercent",
      insurance_copay as copay
    from patients
    where id = $1 and tenant_id = $2`,
    [patientId, tenantId]
  );

  if (!result.rowCount || !result.rows[0].planName) {
    return null;
  }

  const patient = result.rows[0];

  // In production, this would call eligibility verification API
  // For now, use simple calculation based on stored data
  const deductible = patient.deductible || 0;
  const deductibleMet = 0; // Would come from claims history
  const deductibleRemaining = Math.max(0, deductible - deductibleMet);

  return {
    planName: patient.planName,
    deductible,
    deductibleMet,
    deductibleRemaining,
    coinsurancePercent: patient.coinsurancePercent || 20,
    copay: patient.copay || 0,
    outOfPocketMax: 8000, // Typical ACA max
    outOfPocketMet: 0, // Would come from claims history
    isInNetwork: true, // Assume in-network for now
  };
}

/**
 * Create cost estimate for appointment
 */
export async function createCostEstimate(
  tenantId: string,
  patientId: string,
  options: {
    appointmentId?: string;
    serviceType: string;
    cptCodes: string[];
    isCosmetic?: boolean;
    userId: string;
  }
): Promise<CostEstimate> {
  const estimateId = crypto.randomUUID();

  // Get CPT code fees
  let totalCharges = 0;
  const cptDetails: Array<{ code: string; fee: number; description: string }> = [];

  for (const cptCode of options.cptCodes) {
    const feeResult = await pool.query(
      `select
        fsi.cpt_code,
        fsi.cpt_description,
        fsi.fee_cents
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
         and fs.is_default = true
         and fsi.cpt_code = $2
       limit 1`,
      [tenantId, cptCode]
    );

    if (feeResult.rowCount) {
      const fee = feeResult.rows[0].fee_cents / 100;
      totalCharges += fee;
      cptDetails.push({
        code: cptCode,
        fee,
        description: feeResult.rows[0].cpt_description || "",
      });
    }
  }

  // If cosmetic, patient pays 100%
  if (options.isCosmetic) {
    const estimate: CostEstimate = {
      id: estimateId,
      patientId,
      appointmentId: options.appointmentId,
      serviceType: options.serviceType,
      totalCharges,
      insuranceAllowedAmount: 0,
      insurancePays: 0,
      patientResponsibility: totalCharges,
      breakdown: {
        copay: 0,
        deductible: 0,
        coinsurance: 0,
        notCovered: totalCharges,
      },
      isCosmetic: true,
      insuranceVerified: false,
      validUntil: getValidUntilDate(),
    };

    await saveEstimate(tenantId, estimate, cptDetails, options.userId);
    return estimate;
  }

  // Get insurance benefits
  const benefits = await getInsuranceBenefits(tenantId, patientId);

  if (!benefits) {
    // No insurance - patient pays all
    const estimate: CostEstimate = {
      id: estimateId,
      patientId,
      appointmentId: options.appointmentId,
      serviceType: options.serviceType,
      totalCharges,
      insuranceAllowedAmount: 0,
      insurancePays: 0,
      patientResponsibility: totalCharges,
      breakdown: {
        copay: 0,
        deductible: 0,
        coinsurance: 0,
        notCovered: totalCharges,
      },
      isCosmetic: false,
      insuranceVerified: false,
      validUntil: getValidUntilDate(),
    };

    await saveEstimate(tenantId, estimate, cptDetails, options.userId);
    return estimate;
  }

  // Calculate with insurance
  // Assume insurance allows 80% of charges (in production, use contracted rates)
  const insuranceAllowedAmount = totalCharges * 0.8;

  let patientResponsibility = 0;
  const breakdown = {
    copay: 0,
    deductible: 0,
    coinsurance: 0,
    notCovered: 0,
  };

  // 1. Copay
  breakdown.copay = benefits.copay;
  patientResponsibility += breakdown.copay;

  // 2. Deductible (on amount after copay)
  const afterCopay = insuranceAllowedAmount - breakdown.copay;
  breakdown.deductible = Math.min(afterCopay, benefits.deductibleRemaining);
  patientResponsibility += breakdown.deductible;

  // 3. Coinsurance (on amount after copay and deductible)
  const afterDeductible = afterCopay - breakdown.deductible;
  breakdown.coinsurance = afterDeductible * (benefits.coinsurancePercent / 100);
  patientResponsibility += breakdown.coinsurance;

  // 4. Not covered (difference between charges and allowed)
  breakdown.notCovered = totalCharges - insuranceAllowedAmount;
  patientResponsibility += breakdown.notCovered;

  const insurancePays = insuranceAllowedAmount - patientResponsibility;

  const estimate: CostEstimate = {
    id: estimateId,
    patientId,
    appointmentId: options.appointmentId,
    serviceType: options.serviceType,
    totalCharges,
    insuranceAllowedAmount,
    insurancePays,
    patientResponsibility,
    breakdown,
    isCosmetic: false,
    insuranceVerified: false, // Set to true after real-time verification
    validUntil: getValidUntilDate(),
  };

  await saveEstimate(tenantId, estimate, cptDetails, options.userId);
  return estimate;
}

/**
 * Save estimate to database
 */
async function saveEstimate(
  tenantId: string,
  estimate: CostEstimate,
  cptDetails: Array<{ code: string; fee: number; description: string }>,
  userId: string
): Promise<void> {
  await pool.query(
    `insert into cost_estimates (
      id, tenant_id, patient_id, appointment_id,
      service_type, cpt_codes,
      estimated_allowed_amount, estimated_patient_responsibility,
      breakdown, is_cosmetic, insurance_verified,
      valid_until, created_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      estimate.id,
      tenantId,
      estimate.patientId,
      estimate.appointmentId || null,
      estimate.serviceType,
      JSON.stringify(cptDetails),
      estimate.insuranceAllowedAmount,
      estimate.patientResponsibility,
      JSON.stringify(estimate.breakdown),
      estimate.isCosmetic,
      estimate.insuranceVerified,
      estimate.validUntil,
      userId,
    ]
  );
}

/**
 * Get estimate by ID
 */
export async function getEstimate(
  tenantId: string,
  estimateId: string
): Promise<CostEstimate | null> {
  const result = await pool.query(
    `select
      id,
      patient_id as "patientId",
      appointment_id as "appointmentId",
      service_type as "serviceType",
      cpt_codes as "cptCodes",
      estimated_allowed_amount as "insuranceAllowedAmount",
      estimated_patient_responsibility as "patientResponsibility",
      breakdown,
      is_cosmetic as "isCosmetic",
      insurance_verified as "insuranceVerified",
      valid_until as "validUntil"
    from cost_estimates
    where id = $1 and tenant_id = $2`,
    [estimateId, tenantId]
  );

  if (!result.rowCount) return null;

  const row = result.rows[0];
  const breakdown = row.breakdown;
  const cptCodes = row.cptCodes;

  // Calculate totals
  const totalCharges = cptCodes.reduce(
    (sum: number, item: any) => sum + item.fee,
    0
  );
  const insurancePays = row.insuranceAllowedAmount - row.patientResponsibility;

  return {
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    serviceType: row.serviceType,
    totalCharges,
    insuranceAllowedAmount: parseFloat(row.insuranceAllowedAmount),
    insurancePays,
    patientResponsibility: parseFloat(row.patientResponsibility),
    breakdown,
    isCosmetic: row.isCosmetic,
    insuranceVerified: row.insuranceVerified,
    validUntil: row.validUntil,
  };
}

/**
 * Get estimate by appointment ID
 */
export async function getEstimateByAppointment(
  tenantId: string,
  appointmentId: string
): Promise<CostEstimate | null> {
  const result = await pool.query(
    `select
      id,
      patient_id as "patientId",
      appointment_id as "appointmentId",
      service_type as "serviceType",
      cpt_codes as "cptCodes",
      estimated_allowed_amount as "insuranceAllowedAmount",
      estimated_patient_responsibility as "patientResponsibility",
      breakdown,
      is_cosmetic as "isCosmetic",
      insurance_verified as "insuranceVerified",
      valid_until as "validUntil"
    from cost_estimates
    where appointment_id = $1 and tenant_id = $2
    order by created_at desc
    limit 1`,
    [appointmentId, tenantId]
  );

  if (!result.rowCount) return null;

  const row = result.rows[0];
  const breakdown = row.breakdown;
  const cptCodes = row.cptCodes;

  const totalCharges = cptCodes.reduce(
    (sum: number, item: any) => sum + item.fee,
    0
  );
  const insurancePays = row.insuranceAllowedAmount - row.patientResponsibility;

  return {
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    serviceType: row.serviceType,
    totalCharges,
    insuranceAllowedAmount: parseFloat(row.insuranceAllowedAmount),
    insurancePays,
    patientResponsibility: parseFloat(row.patientResponsibility),
    breakdown,
    isCosmetic: row.isCosmetic,
    insuranceVerified: row.insuranceVerified,
    validUntil: row.validUntil,
  };
}

/**
 * Mark estimate as shown to patient
 */
export async function markEstimateShown(
  tenantId: string,
  estimateId: string,
  accepted: boolean
): Promise<void> {
  await pool.query(
    `update cost_estimates
     set shown_to_patient = true,
         shown_at = now(),
         patient_accepted = $1
     where id = $2 and tenant_id = $3`,
    [accepted, estimateId, tenantId]
  );
}

/**
 * Get valid until date (30 days from now)
 */
function getValidUntilDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split("T")[0]!;
}

/**
 * Quick estimate for common procedures
 */
export async function quickEstimate(
  tenantId: string,
  patientId: string,
  procedureType: string
): Promise<{ estimatedCost: number; range: { min: number; max: number } }> {
  // Common dermatology procedures with typical patient responsibility
  const procedureEstimates: Record<
    string,
    { min: number; max: number; typical: number }
  > = {
    "office-visit": { min: 25, max: 150, typical: 40 },
    "biopsy": { min: 100, max: 300, typical: 150 },
    "excision-small": { min: 200, max: 500, typical: 300 },
    "excision-large": { min: 400, max: 1000, typical: 600 },
    "cosmetic-botox": { min: 300, max: 800, typical: 500 },
    "cosmetic-filler": { min: 500, max: 1500, typical: 800 },
    "laser-treatment": { min: 200, max: 1000, typical: 400 },
    "phototherapy": { min: 50, max: 200, typical: 100 },
    "mohs-surgery": { min: 500, max: 2000, typical: 1000 },
  };

  const estimate = procedureEstimates[procedureType] || ({
    min: 50,
    max: 500,
    typical: 200,
  } as { min: number; max: number; typical: number });

  // Adjust for insurance
  const benefits = await getInsuranceBenefits(tenantId, patientId);
  let adjustedCost = estimate.typical;

  if (benefits) {
    // If deductible is met, lower estimate (better insurance pays)
    if (benefits.deductibleMet > benefits.deductible * 0.8) {
      adjustedCost = estimate.min + (estimate.typical - estimate.min) * 0.5;
    }
  } else {
    // No insurance, patient pays more
    adjustedCost = estimate.max;
  }

  return {
    estimatedCost: Math.round(adjustedCost),
    range: { min: estimate.min, max: estimate.max },
  };
}
