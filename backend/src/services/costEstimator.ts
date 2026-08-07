import { pool } from "../db/pool";
import crypto from "crypto";

/**
 * Cost Estimator Service
 * Estimates patient responsibility BEFORE service
 * Helps set expectations and improve collections
 */

export interface InsuranceBenefits {
  planName: string;
  payerName?: string;
  payerId?: string;
  deductible: number;
  deductibleMet: number;
  deductibleRemaining: number;
  coinsurancePercent: number;
  copay: number;
  outOfPocketMax: number;
  outOfPocketMet: number;
  isInNetwork: boolean;
  verified: boolean;
  verificationSource?: string;
  environment: "production" | "sandbox" | "mock" | "unverified";
}

export type EstimateConfidenceLevel = "high" | "medium" | "planning";
export type EstimatePricingBasis = "contract_rate" | "mixed" | "percentage_fallback" | "self_pay";

export interface EstimatePricingDetail {
  code: string;
  charge: number;
  allowedAmount: number;
  basis: "contract_rate" | "percentage_fallback" | "self_pay";
  rateId?: string;
  payerName?: string;
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
    contractualAdjustment: number;
  };
  isCosmetic: boolean;
  insuranceVerified: boolean;
  validUntil: string;
  status: string;
  version: number;
  confidenceLevel: EstimateConfidenceLevel;
  confidenceScore: number;
  confidenceFactors: string[];
  pricingBasis: EstimatePricingBasis;
  pricingDetails: EstimatePricingDetail[];
}

export type InsuranceResponsibility = Pick<
  CostEstimate,
  "insurancePays" | "patientResponsibility" | "breakdown"
>;

/**
 * Calculate the financial split using only normalized monetary inputs.
 *
 * Invariants maintained by this function:
 * - every returned amount is non-negative and rounded to cents;
 * - covered patient responsibility never exceeds the allowed amount;
 * - covered patient responsibility respects the remaining out-of-pocket max;
 * - charge = insurer + patient + contractual adjustment for in-network care;
 * - charge = insurer + patient for out-of-network care (potential balance bill included).
 */
export function calculateInsuranceResponsibility(
  totalChargesInput: number,
  insuranceAllowedAmountInput: number,
  benefits: InsuranceBenefits
): InsuranceResponsibility {
  const totalCharges = nonNegativeMoney(totalChargesInput);
  const insuranceAllowedAmount = Math.min(
    totalCharges,
    nonNegativeMoney(insuranceAllowedAmountInput)
  );
  const outOfPocketRemaining = Math.max(
    0,
    nonNegativeMoney(benefits.outOfPocketMax) - nonNegativeMoney(benefits.outOfPocketMet)
  );

  const copay = Math.min(
    nonNegativeMoney(benefits.copay),
    insuranceAllowedAmount,
    outOfPocketRemaining
  );
  const afterCopay = Math.max(0, insuranceAllowedAmount - copay);
  const deductible = Math.min(
    afterCopay,
    nonNegativeMoney(benefits.deductibleRemaining),
    Math.max(0, outOfPocketRemaining - copay)
  );
  const afterDeductible = Math.max(0, afterCopay - deductible);
  const coinsuranceRate = Math.max(0, Math.min(100, toNumber(benefits.coinsurancePercent))) / 100;
  const coinsurance = Math.min(
    afterDeductible * coinsuranceRate,
    Math.max(0, outOfPocketRemaining - copay - deductible)
  );

  const coveredPatientResponsibility = roundMoney(copay + deductible + coinsurance);
  const chargeAboveAllowed = roundMoney(Math.max(0, totalCharges - insuranceAllowedAmount));
  const breakdown: CostEstimate["breakdown"] = {
    copay: roundMoney(copay),
    deductible: roundMoney(deductible),
    coinsurance: roundMoney(coinsurance),
    notCovered: benefits.isInNetwork ? 0 : chargeAboveAllowed,
    contractualAdjustment: benefits.isInNetwork ? chargeAboveAllowed : 0,
  };

  return {
    insurancePays: roundMoney(Math.max(0, insuranceAllowedAmount - coveredPatientResponsibility)),
    patientResponsibility: roundMoney(coveredPatientResponsibility + breakdown.notCovered),
    breakdown,
  };
}

/**
 * Get patient's insurance benefits
 */
export async function getInsuranceBenefits(
  tenantId: string,
  patientId: string
): Promise<InsuranceBenefits | null> {
  try {
    const verificationResult = await pool.query(
      `select
        coalesce(nullif(plan_name, ''), nullif(payer_name, '')) as "planName",
        nullif(payer_name, '') as "payerName",
        nullif(to_jsonb(insurance_verifications)->>'payer_id', '') as "payerId",
        (coalesce(deductible_total_cents, deductible_total, 0)::numeric / 100.0) as deductible,
        (coalesce(deductible_met_cents, deductible_met, 0)::numeric / 100.0) as "deductibleMet",
        (
          coalesce(
            deductible_remaining_cents,
            deductible_remaining,
            greatest(
              coalesce(deductible_total_cents, deductible_total, 0) -
              coalesce(deductible_met_cents, deductible_met, 0),
              0
            )
          )::numeric / 100.0
        ) as "deductibleRemaining",
        coalesce(coinsurance_pct, coinsurance_percent, 20) as "coinsurancePercent",
        (coalesce(copay_specialist_cents, copay_amount_cents, specialist_copay, copay_amount, 0)::numeric / 100.0) as copay,
        (coalesce(oop_max_cents, out_of_pocket_max_cents, oop_max, 800000)::numeric / 100.0) as "outOfPocketMax",
        (coalesce(oop_met_cents, out_of_pocket_met_cents, oop_met, 0)::numeric / 100.0) as "outOfPocketMet",
        coalesce(in_network, true) as "isInNetwork",
        nullif(to_jsonb(insurance_verifications)->>'verification_source', '') as "verificationSource"
       from insurance_verifications
       where patient_id = $1
         and tenant_id = $2
         and verification_status = 'active'
         and coalesce(has_issues, false) = false
         and (expires_at is null or expires_at > now())
       order by verified_at desc
       limit 1`,
      [patientId, tenantId]
    );

    const verification = verificationResult.rows[0];
    if (verification?.planName) {
      return {
        planName: verification.planName,
        payerName: verification.payerName || verification.planName,
        deductible: toNumber(verification.deductible),
        deductibleMet: toNumber(verification.deductibleMet),
        deductibleRemaining: toNumber(verification.deductibleRemaining),
        coinsurancePercent: toNumber(verification.coinsurancePercent, 20),
        copay: toNumber(verification.copay),
        outOfPocketMax: toNumber(verification.outOfPocketMax, 8000),
        outOfPocketMet: toNumber(verification.outOfPocketMet),
        isInNetwork: verification.isInNetwork !== false,
        verified: true,
        payerId: verification.payerId || undefined,
        verificationSource: verification.verificationSource || undefined,
        environment: getVerificationEnvironment(verification.verificationSource),
      };
    }
  } catch (error: any) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
  }

  const result = await pool.query(
    `select
      coalesce(
        nullif(to_jsonb(p)->>'insurance_name', ''),
        nullif(to_jsonb(p)->>'insurance_plan_name', ''),
        nullif(to_jsonb(p)->>'insurance', '')
      ) as "planName",
      nullif(to_jsonb(p)->>'insurance_deductible', '')::numeric as deductible,
      nullif(to_jsonb(p)->>'insurance_coinsurance_percent', '')::numeric as "coinsurancePercent",
      coalesce(
        nullif(to_jsonb(p)->>'insurance_copay', '')::numeric,
        nullif(to_jsonb(p)->>'copay_amount_cents', '')::numeric / 100.0
      ) as copay
    from patients p
    where p.id = $1 and p.tenant_id = $2`,
    [patientId, tenantId]
  );

  if (!result.rowCount || !result.rows[0].planName) {
    return null;
  }

  const patient = result.rows[0];

  // Fallback for patients without a current real-time eligibility verification.
  const deductible = toNumber(patient.deductible);
  const deductibleMet = 0; // Would come from claims history
  const deductibleRemaining = Math.max(0, deductible - deductibleMet);

  return {
    planName: patient.planName,
    payerName: patient.planName,
    deductible,
    deductibleMet,
    deductibleRemaining,
    coinsurancePercent: toNumber(patient.coinsurancePercent, 20),
    copay: toNumber(patient.copay),
    outOfPocketMax: 8000, // Typical ACA max
    outOfPocketMet: 0, // Would come from claims history
    isInNetwork: true, // Assume in-network for now
    verified: false,
    environment: "unverified",
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
    const pricingDetails = cptDetails.map(item => ({
      code: item.code,
      charge: item.fee,
      allowedAmount: item.fee,
      basis: "self_pay" as const,
    }));
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
        contractualAdjustment: 0,
      },
      isCosmetic: true,
      insuranceVerified: false,
      validUntil: getValidUntilDate(),
      status: "draft",
      version: 1,
      confidenceLevel: "high",
      confidenceScore: 95,
      confidenceFactors: ["Office fee schedule", "Patient-paid cosmetic service"],
      pricingBasis: "self_pay",
      pricingDetails,
    };

    await saveEstimate(tenantId, estimate, cptDetails, options.userId);
    return estimate;
  }

  // Get insurance benefits
  const benefits = await getInsuranceBenefits(tenantId, patientId);

  if (!benefits) {
    const pricingDetails = cptDetails.map(item => ({
      code: item.code,
      charge: item.fee,
      allowedAmount: item.fee,
      basis: "self_pay" as const,
    }));
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
        contractualAdjustment: 0,
      },
      isCosmetic: false,
      insuranceVerified: false,
      validUntil: getValidUntilDate(),
      status: "draft",
      version: 1,
      confidenceLevel: "medium",
      confidenceScore: 70,
      confidenceFactors: ["Office fee schedule", "No active insurance benefits found"],
      pricingBasis: "self_pay",
      pricingDetails,
    };

    await saveEstimate(tenantId, estimate, cptDetails, options.userId);
    return estimate;
  }

  // Calculate the allowed amount per procedure. Configured payer contract rates
  // always win; only missing codes use the disclosed planning fallback.
  const pricingDetails = await resolveAllowedAmounts(tenantId, benefits, cptDetails);
  const insuranceAllowedAmount = roundMoney(
    pricingDetails.reduce((sum, item) => sum + item.allowedAmount, 0)
  );
  const contractLineCount = pricingDetails.filter(item => item.basis === "contract_rate").length;
  const pricingBasis: EstimatePricingBasis = contractLineCount === pricingDetails.length
    ? "contract_rate"
    : contractLineCount > 0
      ? "mixed"
      : "percentage_fallback";
  const confidence = calculateConfidence(benefits, pricingBasis);

  const responsibility = calculateInsuranceResponsibility(totalCharges, insuranceAllowedAmount, benefits);

  const estimate: CostEstimate = {
    id: estimateId,
    patientId,
    appointmentId: options.appointmentId,
    serviceType: options.serviceType,
    totalCharges,
    insuranceAllowedAmount,
    insurancePays: responsibility.insurancePays,
    patientResponsibility: responsibility.patientResponsibility,
    breakdown: responsibility.breakdown,
    isCosmetic: false,
    insuranceVerified: benefits.verified,
    validUntil: getValidUntilDate(),
    status: "draft",
    version: 1,
    confidenceLevel: confidence.level,
    confidenceScore: confidence.score,
    confidenceFactors: confidence.factors,
    pricingBasis,
    pricingDetails,
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
      valid_until, created_by, status, version,
      confidence_level, confidence_score, confidence_factors,
      pricing_basis, pricing_details
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20)`,
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
      estimate.status,
      estimate.version,
      estimate.confidenceLevel,
      estimate.confidenceScore,
      JSON.stringify(estimate.confidenceFactors),
      estimate.pricingBasis,
      JSON.stringify(estimate.pricingDetails),
    ]
  );

  await recordEstimateEvent(tenantId, estimate.id, estimate.patientId, "staff", userId, "created", null, {
    version: estimate.version,
    confidenceLevel: estimate.confidenceLevel,
    pricingBasis: estimate.pricingBasis,
  });
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
      ,status
      ,version
      ,confidence_level as "confidenceLevel"
      ,confidence_score as "confidenceScore"
      ,confidence_factors as "confidenceFactors"
      ,pricing_basis as "pricingBasis"
      ,pricing_details as "pricingDetails"
    from cost_estimates
    where id = $1 and tenant_id = $2`,
    [estimateId, tenantId]
  );

  if (!result.rowCount) return null;

  const row = result.rows[0];
  const breakdown = normalizeBreakdown(row.breakdown);
  const cptCodes = normalizeCptDetails(row.cptCodes);

  // Calculate totals
  const totalCharges = cptCodes.reduce(
    (sum: number, item) => sum + toNumber(item.fee),
    0
  );
  const insuranceAllowedAmount = toNumber(row.insuranceAllowedAmount);
  const patientResponsibility = toNumber(row.patientResponsibility);
  const insurancePays = calculateInsurancePays(insuranceAllowedAmount, breakdown);

  return {
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    serviceType: row.serviceType,
    totalCharges,
    insuranceAllowedAmount,
    insurancePays,
    patientResponsibility,
    breakdown,
    isCosmetic: row.isCosmetic,
    insuranceVerified: row.insuranceVerified,
    validUntil: row.validUntil,
    status: row.status || "draft",
    version: toNumber(row.version, 1),
    confidenceLevel: normalizeConfidenceLevel(row.confidenceLevel),
    confidenceScore: toNumber(row.confidenceScore, 40),
    confidenceFactors: normalizeStringArray(row.confidenceFactors),
    pricingBasis: normalizePricingBasis(row.pricingBasis),
    pricingDetails: normalizePricingDetails(row.pricingDetails),
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
      ,status
      ,version
      ,confidence_level as "confidenceLevel"
      ,confidence_score as "confidenceScore"
      ,confidence_factors as "confidenceFactors"
      ,pricing_basis as "pricingBasis"
      ,pricing_details as "pricingDetails"
    from cost_estimates
    where appointment_id = $1 and tenant_id = $2
    order by created_at desc
    limit 1`,
    [appointmentId, tenantId]
  );

  if (!result.rowCount) return null;

  const row = result.rows[0];
  const breakdown = normalizeBreakdown(row.breakdown);
  const cptCodes = normalizeCptDetails(row.cptCodes);

  const totalCharges = cptCodes.reduce(
    (sum: number, item) => sum + toNumber(item.fee),
    0
  );
  const insuranceAllowedAmount = toNumber(row.insuranceAllowedAmount);
  const patientResponsibility = toNumber(row.patientResponsibility);
  const insurancePays = calculateInsurancePays(insuranceAllowedAmount, breakdown);

  return {
    id: row.id,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    serviceType: row.serviceType,
    totalCharges,
    insuranceAllowedAmount,
    insurancePays,
    patientResponsibility,
    breakdown,
    isCosmetic: row.isCosmetic,
    insuranceVerified: row.insuranceVerified,
    validUntil: row.validUntil,
    status: row.status || "draft",
    version: toNumber(row.version, 1),
    confidenceLevel: normalizeConfidenceLevel(row.confidenceLevel),
    confidenceScore: toNumber(row.confidenceScore, 40),
    confidenceFactors: normalizeStringArray(row.confidenceFactors),
    pricingBasis: normalizePricingBasis(row.pricingBasis),
    pricingDetails: normalizePricingDetails(row.pricingDetails),
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
         patient_accepted = $1,
         status = case when $1 then 'acknowledged' else 'shared' end,
         acknowledged_at = case when $1 then now() else acknowledged_at end,
         updated_at = now()
     where id = $2 and tenant_id = $3`,
    [accepted, estimateId, tenantId]
  );
}

/**
 * Share an estimate with the patient portal without recording a patient decision.
 */
export async function shareEstimateWithPatient(
  tenantId: string,
  estimateId: string,
  actorId?: string
): Promise<{ patientId: string; sharedAt: string } | null> {
  const result = await pool.query(
    `update cost_estimates
     set shown_to_patient = true,
         shown_at = now(),
         status = 'shared',
         updated_at = now()
     where id = $1 and tenant_id = $2
       and status not in ('revoked', 'superseded', 'expired')
     returning patient_id as "patientId", shown_at as "sharedAt"`,
    [estimateId, tenantId]
  );

  if (!result.rowCount) return null;

  const shared = {
    patientId: String(result.rows[0].patientId),
    sharedAt: new Date(result.rows[0].sharedAt).toISOString(),
  };
  await recordEstimateEvent(tenantId, estimateId, shared.patientId, "staff", actorId || null, "shared");
  return shared;
}

/**
 * Get valid until date (30 days from now)
 */
function getValidUntilDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().split("T")[0]!;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCptDetails(
  value: unknown
): Array<{ code?: string; fee: number; description?: string }> {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((rawItem) => {
    const item = isRecord(rawItem) ? rawItem : {};
    return {
      code: typeof item?.code === "string" ? item.code : undefined,
      fee: toNumber(item?.fee),
      description:
        typeof item?.description === "string" ? item.description : undefined,
    };
  });
}

function normalizeBreakdown(value: unknown): CostEstimate["breakdown"] {
  const parsed = parseJson<Record<string, unknown>>(value, {});
  return {
    copay: toNumber(parsed?.copay),
    deductible: toNumber(parsed?.deductible),
    coinsurance: toNumber(parsed?.coinsurance),
    notCovered: toNumber(parsed?.notCovered),
    contractualAdjustment: toNumber(parsed?.contractualAdjustment),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return (value ?? fallback) as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calculateInsurancePays(
  insuranceAllowedAmount: number,
  breakdown: CostEstimate["breakdown"]
): number {
  const coveredPatientResponsibility =
    breakdown.copay + breakdown.deductible + breakdown.coinsurance;
  return Math.max(0, insuranceAllowedAmount - coveredPatientResponsibility);
}

function isMissingRelationError(error: any): boolean {
  return error?.code === "42P01" || String(error?.message || "").includes("does not exist");
}

function getVerificationEnvironment(source: unknown): InsuranceBenefits["environment"] {
  const normalized = String(source || "").toLowerCase();
  if (!normalized) return "unverified";
  if (normalized.includes("mock")) return "mock";
  if (
    normalized.includes("sandbox") ||
    normalized.includes("test") ||
    (normalized.includes("stedi") && String(process.env.STEDI_API_KEY || "").startsWith("test_"))
  ) return "sandbox";
  return "production";
}

async function resolveAllowedAmounts(
  tenantId: string,
  benefits: InsuranceBenefits,
  cptDetails: Array<{ code: string; fee: number; description: string }>
): Promise<EstimatePricingDetail[]> {
  const details: EstimatePricingDetail[] = [];

  for (const item of cptDetails) {
    try {
      const rateResult = await pool.query(
        `select id,
                payer_name as "payerName",
                allowed_amount_cents as "allowedAmountCents"
         from payer_contract_rates
         where tenant_id = $1
           and cpt_code = $2
           and is_active = true
           and effective_date <= current_date
           and (termination_date is null or termination_date >= current_date)
           and (
             ($3::text is not null and payer_id = $3)
             or lower(payer_name) = lower($4)
           )
           and (plan_name is null or lower(plan_name) = lower($5))
         order by
           case when $3::text is not null and payer_id = $3 then 0 else 1 end,
           case when plan_name is not null then 0 else 1 end,
           effective_date desc
         limit 1`,
        [tenantId, item.code, benefits.payerId || null, benefits.payerName || benefits.planName, benefits.planName]
      );

      if (rateResult.rowCount) {
        const rate = rateResult.rows[0];
        details.push({
          code: item.code,
          charge: item.fee,
          // A payer fee schedule may contain an amount above the submitted
          // charge, but adjudication cannot allow more than was charged.
          allowedAmount: roundMoney(Math.min(
            item.fee,
            Math.max(0, toNumber(rate.allowedAmountCents) / 100)
          )),
          basis: "contract_rate",
          rateId: String(rate.id),
          payerName: rate.payerName || benefits.payerName || benefits.planName,
        });
        continue;
      }
    } catch (error: any) {
      if (!isMissingRelationError(error)) throw error;
    }

    details.push({
      code: item.code,
      charge: item.fee,
      allowedAmount: roundMoney(item.fee * 0.8),
      basis: "percentage_fallback",
      payerName: benefits.payerName || benefits.planName,
    });
  }

  return details;
}

function calculateConfidence(
  benefits: InsuranceBenefits,
  pricingBasis: EstimatePricingBasis
): { level: EstimateConfidenceLevel; score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 20;

  if (pricingBasis === "contract_rate") {
    score += 45;
    factors.push("Current payer contract rate for every procedure");
  } else if (pricingBasis === "mixed") {
    score += 25;
    factors.push("Contract rates found for some procedures");
    factors.push("Planning fallback used for procedures without a configured rate");
  } else {
    score += 10;
    factors.push("Planning fallback used because no payer contract rate is configured");
  }

  if (benefits.verified) {
    score += benefits.environment === "production" ? 25 : 10;
    factors.push(
      benefits.environment === "production"
        ? "Current production eligibility response"
        : `Current ${benefits.environment} eligibility response`
    );
  } else {
    factors.push("Benefits are from the patient record and are not currently verified");
  }

  score = Math.max(0, Math.min(100, score));
  return {
    level: score >= 85 ? "high" : score >= 60 ? "medium" : "planning",
    score,
    factors,
  };
}

function normalizeConfidenceLevel(value: unknown): EstimateConfidenceLevel {
  return value === "high" || value === "medium" ? value : "planning";
}

function normalizePricingBasis(value: unknown): EstimatePricingBasis {
  if (value === "contract_rate" || value === "mixed" || value === "self_pay") return value;
  return "percentage_fallback";
}

function normalizeStringArray(value: unknown): string[] {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function normalizePricingDetails(value: unknown): EstimatePricingDetail[] {
  const parsed = parseJson<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecord).map(item => ({
    code: String(item.code || ""),
    charge: toNumber(item.charge),
    allowedAmount: toNumber(item.allowedAmount),
    basis: item.basis === "contract_rate" || item.basis === "self_pay"
      ? item.basis
      : "percentage_fallback",
    rateId: typeof item.rateId === "string" ? item.rateId : undefined,
    payerName: typeof item.payerName === "string" ? item.payerName : undefined,
  }));
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegativeMoney(value: unknown): number {
  return roundMoney(Math.max(0, toNumber(value)));
}

export type EstimateEventType =
  | "created" | "shared" | "viewed" | "acknowledged" | "call_requested"
  | "billing_question" | "payment_plan_requested" | "revised" | "superseded"
  | "revoked" | "expired" | "pdf_downloaded" | "reconciled";

export async function recordEstimateEvent(
  tenantId: string,
  estimateId: string,
  patientId: string,
  actorType: "staff" | "patient" | "system",
  actorId: string | null,
  eventType: EstimateEventType,
  message: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await pool.query(
      `insert into cost_estimate_events (
         id, tenant_id, estimate_id, patient_id, actor_type, actor_id,
         event_type, message, metadata
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [crypto.randomUUID(), tenantId, estimateId, patientId, actorType, actorId, eventType, message, JSON.stringify(metadata)]
    );
  } catch (error: any) {
    if (!isMissingRelationError(error)) throw error;
  }
}

export async function revokeEstimate(
  tenantId: string,
  estimateId: string,
  actorId: string,
  reason: string
): Promise<{ patientId: string } | null> {
  const result = await pool.query(
    `update cost_estimates
     set status = 'revoked', shown_to_patient = false, revoked_at = now(),
         revoked_by = $3, revocation_reason = $4, updated_at = now()
     where id = $1 and tenant_id = $2 and status not in ('revoked', 'superseded')
     returning patient_id as "patientId"`,
    [estimateId, tenantId, actorId, reason]
  );
  if (!result.rowCount) return null;
  const patientId = String(result.rows[0].patientId);
  await recordEstimateEvent(tenantId, estimateId, patientId, "staff", actorId, "revoked", reason);
  return { patientId };
}

export async function reviseEstimate(
  tenantId: string,
  estimateId: string,
  options: { serviceType?: string; cptCodes: string[]; isCosmetic?: boolean; appointmentId?: string; userId: string }
): Promise<CostEstimate | null> {
  const original = await getEstimate(tenantId, estimateId);
  if (!original || ["revoked", "superseded"].includes(original.status)) return null;

  const revised = await createCostEstimate(tenantId, original.patientId, {
    appointmentId: options.appointmentId ?? original.appointmentId,
    serviceType: options.serviceType || original.serviceType,
    cptCodes: options.cptCodes,
    isCosmetic: options.isCosmetic ?? original.isCosmetic,
    userId: options.userId,
  });
  revised.version = original.version + 1;

  await pool.query(
    `update cost_estimates
     set version = $1, supersedes_estimate_id = $2, updated_at = now()
     where id = $3 and tenant_id = $4`,
    [revised.version, estimateId, revised.id, tenantId]
  );
  await pool.query(
    `update cost_estimates
     set status = 'superseded', shown_to_patient = false,
         superseded_by_estimate_id = $1, updated_at = now()
     where id = $2 and tenant_id = $3`,
    [revised.id, estimateId, tenantId]
  );
  await recordEstimateEvent(tenantId, estimateId, original.patientId, "staff", options.userId, "superseded", null, {
    supersededByEstimateId: revised.id,
  });
  await recordEstimateEvent(tenantId, revised.id, original.patientId, "staff", options.userId, "revised", null, {
    supersedesEstimateId: estimateId,
    version: revised.version,
  });
  return revised;
}

export async function respondToEstimate(
  tenantId: string,
  patientId: string,
  estimateId: string,
  eventType: "acknowledged" | "call_requested" | "billing_question" | "payment_plan_requested",
  message?: string
): Promise<{ status: string; respondedAt: string } | null> {
  const status = eventType === "acknowledged" ? "acknowledged" : eventType;
  const result = await pool.query(
    `update cost_estimates
     set status = $4,
         patient_accepted = case when $4 = 'acknowledged' then true else patient_accepted end,
         acknowledged_at = case when $4 = 'acknowledged' then now() else acknowledged_at end,
         updated_at = now()
     where id = $1 and tenant_id = $2 and patient_id = $3
       and shown_to_patient = true
       and status not in ('revoked', 'superseded', 'expired')
       and (valid_until is null or valid_until >= current_date)
     returning status, updated_at as "respondedAt"`,
    [estimateId, tenantId, patientId, status]
  );
  if (!result.rowCount) return null;
  await recordEstimateEvent(tenantId, estimateId, patientId, "patient", patientId, eventType, message || null);
  return {
    status: String(result.rows[0].status),
    respondedAt: new Date(result.rows[0].respondedAt).toISOString(),
  };
}

export function calculateEstimateReconciliation(input: {
  estimatedAllowedAmount: number;
  estimatedPatientResponsibility: number;
  actualAllowedAmount: number;
  actualPatientResponsibility: number;
}): { allowedVariance: number; patientVariance: number; accuracyPercent: number } {
  const allowedVariance = roundMoney(input.actualAllowedAmount - input.estimatedAllowedAmount);
  const patientVariance = roundMoney(input.actualPatientResponsibility - input.estimatedPatientResponsibility);
  const denominator = Math.max(input.actualPatientResponsibility, input.estimatedPatientResponsibility, 1);
  const accuracyPercent = Math.max(0, Math.min(100, 100 - (Math.abs(patientVariance) / denominator) * 100));
  return { allowedVariance, patientVariance, accuracyPercent: roundMoney(accuracyPercent) };
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
