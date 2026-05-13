import { pool } from "../db/pool";

export interface ScrubIssue {
  severity: "error" | "warning" | "info";
  ruleCode: string;
  ruleName: string;
  message: string;
  suggestion?: string;
  autoFixable?: boolean;
  autoFixAction?: any;
}

export interface ScrubResult {
  status: "clean" | "warnings" | "errors";
  errors: ScrubIssue[];
  warnings: ScrubIssue[];
  info: ScrubIssue[];
  canSubmit: boolean;
}

export interface ClaimLineItem {
  cpt: string;
  modifiers?: string[];
  dx: string[];
  diagnosisPointers?: string[];
  units: number;
  charge: number;
  description?: string;
  codeType?: "CPT" | "HCPCS" | "INTERNAL";
  billingRoute?: "insurance" | "self_pay" | "non_billable";
}

export interface ClaimForScrubbing {
  id: string;
  tenantId: string;
  patientId: string;
  serviceDate: string;
  lineItems: ClaimLineItem[];
  payerId?: string;
  payerName?: string;
  isCosmetic?: boolean;
  patient?: {
    firstName?: string | null;
    lastName?: string | null;
    dob?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    insuranceMemberId?: string | null;
  };
  provider?: {
    id?: string | null;
    name?: string | null;
    npi?: string | null;
  };
  placeOfService?: string | null;
}

/**
 * Main claim scrubber service
 * Validates claims against dermatology-specific rules
 */
export async function scrubClaim(claim: ClaimForScrubbing): Promise<ScrubResult> {
  const errors: ScrubIssue[] = [];
  const warnings: ScrubIssue[] = [];
  const info: ScrubIssue[] = [];

  const builtInIssues = runBuiltInReadinessChecks(claim);
  for (const issue of builtInIssues) {
    if (issue.severity === "error") {
      errors.push(issue);
    } else if (issue.severity === "warning") {
      warnings.push(issue);
    } else {
      info.push(issue);
    }
  }

  const rules = await loadActiveScrubRules(claim.tenantId);

  // Run each rule
  for (const rule of rules) {
    const ruleLogic = rule.rule_logic;
    const issues = await evaluateRule(claim, rule);

    for (const issue of issues) {
      if (issue.severity === "error") {
        errors.push(issue);
      } else if (issue.severity === "warning") {
        warnings.push(issue);
      } else {
        info.push(issue);
      }
    }
  }

  // Determine overall status
  let status: "clean" | "warnings" | "errors" = "clean";
  if (errors.length > 0) {
    status = "errors";
  } else if (warnings.length > 0) {
    status = "warnings";
  }

  const canSubmit = errors.length === 0;

  return {
    status,
    errors,
    warnings,
    info,
    canSubmit,
  };
}

function isMissingRelationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01";
}

async function loadActiveScrubRules(tenantId: string): Promise<any[]> {
  try {
    const tableResult = await pool.query(`SELECT to_regclass('public.claim_scrub_rules') as table_name`);
    if (!tableResult.rows[0]?.table_name) {
      return [];
    }

    const rulesResult = await pool.query(
      `SELECT id, rule_code, rule_name, description, severity, rule_logic
       FROM claim_scrub_rules
       WHERE is_active = true AND (tenant_id IS NULL OR tenant_id = $1)
       ORDER BY severity DESC`,
      [tenantId]
    );
    return rulesResult.rows;
  } catch (error) {
    // The custom rules table is optional in older/local databases. Core readiness checks still run.
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeDxCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((code) => normalizeText(code).toUpperCase()).filter(Boolean)));
}

function isInsuranceRoutedLine(item: ClaimLineItem): boolean {
  return item.billingRoute !== "self_pay" && item.billingRoute !== "non_billable";
}

function isValidProcedureCode(item: ClaimLineItem): boolean {
  const code = normalizeText(item.cpt).toUpperCase();
  if (item.codeType === "HCPCS") return /^[A-Z]\d{4}$/.test(code);
  if (item.codeType === "INTERNAL" || item.billingRoute === "self_pay") return code.length >= 2;
  return /^\d{5}$/.test(code) || /^[A-Z]\d{4}$/.test(code);
}

function pushIssue(target: ScrubIssue[], issue: ScrubIssue): void {
  target.push(issue);
}

interface CodeRange {
  start: number;
  end: number;
}

interface DermatologyMedicalNecessityRule {
  ruleCode: string;
  ruleName: string;
  codeRanges?: CodeRange[];
  exactCodes?: string[];
  codePrefixes?: string[];
  supportedDxPrefixes: string[];
  supportedDxDescription: string;
  suggestion: string;
  documentationReminder?: string;
}

const DERMATOLOGY_MEDICAL_NECESSITY_RULES: DermatologyMedicalNecessityRule[] = [
  {
    ruleCode: "DERM_MN_BIOPSY_DX",
    ruleName: "Biopsy Diagnosis Support",
    codeRanges: [{ start: 11100, end: 11107 }],
    supportedDxPrefixes: [
      "C43",
      "C44",
      "C4A",
      "D03",
      "D04",
      "D22",
      "D23",
      "D48.5",
      "D49.2",
      "L57",
      "L81.4",
      "L82",
      "L98.9",
      "R21",
    ],
    supportedDxDescription: "suspicious lesion, neoplasm, malignancy, actinic damage, rash, or changing pigmented lesion",
    suggestion: "Confirm the linked diagnosis reflects the lesion being sampled rather than an unrelated chronic condition.",
  },
  {
    ruleCode: "DERM_MN_MOHS_DX",
    ruleName: "Mohs Diagnosis Support",
    codeRanges: [{ start: 17311, end: 17315 }],
    supportedDxPrefixes: ["C00", "C43", "C44", "C4A", "D03", "D04", "D48.5"],
    supportedDxDescription: "skin cancer, melanoma in situ, carcinoma in situ, Merkel cell carcinoma, or uncertain skin neoplasm",
    suggestion: "Verify the diagnosis, tumor location, pathology, and Mohs indication are documented before claim submission.",
  },
  {
    ruleCode: "DERM_MN_MALIGNANT_EXCISION_DX",
    ruleName: "Malignant Excision Diagnosis Support",
    codeRanges: [{ start: 11600, end: 11646 }],
    supportedDxPrefixes: ["C43", "C44", "C4A", "D03", "D04"],
    supportedDxDescription: "malignant skin neoplasm or carcinoma/melanoma in situ",
    suggestion: "Use a malignant diagnosis for malignant excision codes, or choose the benign excision/removal code when appropriate.",
  },
  {
    ruleCode: "DERM_MN_BENIGN_EXCISION_DX",
    ruleName: "Benign Excision Diagnosis Support",
    codeRanges: [{ start: 11400, end: 11446 }],
    supportedDxPrefixes: ["B07", "D17", "D18", "D21", "D22", "D23", "D48.5", "L72", "L82", "L91.8", "L98.9", "Q82.5"],
    supportedDxDescription: "benign lesion, nevus, cyst, wart, symptomatic seborrheic keratosis, skin tag, or uncertain skin neoplasm",
    suggestion: "Confirm the selected code and diagnosis both describe benign lesion removal.",
    documentationReminder: "Benign lesion removals often need documentation of symptoms, inflammation, growth, bleeding, pain, irritation, recurrent trauma, or functional impairment.",
  },
  {
    ruleCode: "DERM_MN_PREMALIGNANT_DESTRUCTION_DX",
    ruleName: "Premalignant Destruction Diagnosis Support",
    codeRanges: [{ start: 17000, end: 17004 }],
    supportedDxPrefixes: ["L57.0"],
    supportedDxDescription: "actinic keratosis",
    suggestion: "Use actinic keratosis diagnosis support for premalignant destruction codes, or pick the destruction code family that matches the lesion.",
  },
  {
    ruleCode: "DERM_MN_BENIGN_DESTRUCTION_DX",
    ruleName: "Benign Destruction Diagnosis Support",
    exactCodes: ["17110", "17111"],
    supportedDxPrefixes: ["B07", "D22", "D23", "L82", "L91.8", "Q82.5"],
    supportedDxDescription: "wart, benign lesion, inflamed seborrheic keratosis, skin tag, or vascular birthmark",
    suggestion: "Confirm the linked diagnosis supports benign lesion destruction rather than cosmetic-only treatment.",
    documentationReminder: "For benign lesion destruction, document symptoms or clinical reasons when billing insurance.",
  },
  {
    ruleCode: "DERM_MN_MALIGNANT_DESTRUCTION_DX",
    ruleName: "Malignant Destruction Diagnosis Support",
    codeRanges: [{ start: 17260, end: 17286 }],
    supportedDxPrefixes: ["C43", "C44", "C4A", "D03", "D04"],
    supportedDxDescription: "malignant skin neoplasm or carcinoma/melanoma in situ",
    suggestion: "Link malignant destruction codes to the matching malignant or in-situ diagnosis.",
  },
  {
    ruleCode: "DERM_MN_PATHOLOGY_DX",
    ruleName: "Dermatopathology Diagnosis Support",
    exactCodes: ["88304", "88305"],
    supportedDxPrefixes: ["B07", "C43", "C44", "C4A", "D03", "D04", "D17", "D18", "D21", "D22", "D23", "D48.5", "D49.2", "L57", "L72", "L81", "L82", "L91", "L98", "R21"],
    supportedDxDescription: "submitted skin specimen, lesion, rash, neoplasm, cyst, wart, or skin cancer diagnosis",
    suggestion: "Confirm the pathology line is linked to the specimen or lesion diagnosis from the encounter.",
  },
  {
    ruleCode: "DERM_MN_PATCH_TEST_DX",
    ruleName: "Patch Testing Diagnosis Support",
    exactCodes: ["95044"],
    supportedDxPrefixes: ["L20", "L23", "L24", "L25", "L30"],
    supportedDxDescription: "allergic, irritant, atopic, or unspecified dermatitis",
    suggestion: "Patch testing should be linked to dermatitis/contact allergy evaluation diagnoses.",
  },
  {
    ruleCode: "DERM_MN_PHOTOTHERAPY_DX",
    ruleName: "Phototherapy Diagnosis Support",
    exactCodes: ["96900", "96910", "96912", "96913"],
    supportedDxPrefixes: ["L20", "L30", "L40", "L41", "L80"],
    supportedDxDescription: "psoriasis, atopic dermatitis/eczema, parapsoriasis, or vitiligo",
    suggestion: "Confirm phototherapy is linked to the chronic inflammatory or pigment disorder being treated.",
  },
  {
    ruleCode: "DERM_MN_INTRASCAR_INJECTION_DX",
    ruleName: "Intralesional Injection Diagnosis Support",
    exactCodes: ["11900", "11901"],
    supportedDxPrefixes: ["L28", "L63", "L72", "L73.0", "L91.0"],
    supportedDxDescription: "keloid/hypertrophic scar, alopecia areata, cyst, acne scarring, or lichen simplex chronicus",
    suggestion: "Confirm the injection line is linked to the lesion/scar/alopecia diagnosis being treated.",
  },
];

function numericProcedureCode(code: string): number | null {
  if (!/^\d{5}$/.test(code)) return null;
  return Number.parseInt(code, 10);
}

function ruleMatchesProcedure(rule: DermatologyMedicalNecessityRule, code: string): boolean {
  const numericCode = numericProcedureCode(code);
  if (rule.exactCodes?.includes(code)) return true;
  if (rule.codePrefixes?.some((prefix) => code.startsWith(prefix))) return true;
  if (numericCode !== null && rule.codeRanges?.some((range) => numericCode >= range.start && numericCode <= range.end)) {
    return true;
  }
  return false;
}

function dxMatchesPrefix(dx: string, prefix: string): boolean {
  return dx === prefix || dx.startsWith(prefix);
}

function hasSupportedDiagnosis(dxCodes: string[], rule: DermatologyMedicalNecessityRule): boolean {
  return dxCodes.some((dx) => rule.supportedDxPrefixes.some((prefix) => dxMatchesPrefix(dx, prefix)));
}

function checkBuiltInDermatologyMedicalNecessity(claim: ClaimForScrubbing): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const lineItems = Array.isArray(claim.lineItems) ? claim.lineItems : [];

  for (const item of lineItems) {
    if (!isInsuranceRoutedLine(item)) continue;
    const code = normalizeText(item.cpt).toUpperCase();
    const dxCodes = normalizeDxCodes(item.dx);
    if (!code || dxCodes.length === 0) continue;

    const rule = DERMATOLOGY_MEDICAL_NECESSITY_RULES.find((candidate) => ruleMatchesProcedure(candidate, code));
    if (!rule) continue;

    if (!hasSupportedDiagnosis(dxCodes, rule)) {
      issues.push({
        severity: "warning",
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        message: `${code} is linked to ${dxCodes.join(", ")}, which does not look like typical support for ${rule.supportedDxDescription}.`,
        suggestion: rule.suggestion,
        autoFixable: false,
      });
      continue;
    }

    if (rule.documentationReminder) {
      issues.push({
        severity: "info",
        ruleCode: `${rule.ruleCode}_DOC`,
        ruleName: `${rule.ruleName} Documentation Reminder`,
        message: `${code} has a compatible diagnosis; confirm documentation supports why it was medically necessary.`,
        suggestion: rule.documentationReminder,
        autoFixable: false,
      });
    }
  }

  return issues;
}

function runBuiltInReadinessChecks(claim: ClaimForScrubbing): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const lineItems = Array.isArray(claim.lineItems) ? claim.lineItems : [];
  const insuranceLineItems = lineItems.filter(isInsuranceRoutedLine);
  const diagnosisCodes = Array.from(new Set(lineItems.flatMap((item) => normalizeDxCodes(item.dx))));

  if (!normalizeText(claim.serviceDate)) {
    pushIssue(issues, {
      severity: "error",
      ruleCode: "CORE_SERVICE_DATE",
      ruleName: "Service Date Required",
      message: "Claim is missing a date of service.",
      suggestion: "Add the encounter service date before coding review release.",
    });
  }

  if (lineItems.length === 0) {
    pushIssue(issues, {
      severity: "error",
      ruleCode: "CORE_LINE_ITEMS",
      ruleName: "Charge Lines Required",
      message: "Claim has no CPT/HCPCS charge lines.",
      suggestion: "Add at least one billable procedure, exam, test, supply, or treatment charge.",
    });
  }

  if (insuranceLineItems.length > 0 && !normalizeText(claim.payerId) && !normalizeText(claim.payerName)) {
    pushIssue(issues, {
      severity: "error",
      ruleCode: "CORE_PAYER",
      ruleName: "Payer Required",
      message: "Insurance claim is missing payer information.",
      suggestion: "Attach active insurance or mark the charges as self-pay before submission.",
    });
  }

  if (diagnosisCodes.length > 12) {
    pushIssue(issues, {
      severity: "error",
      ruleCode: "CORE_DX_LIMIT",
      ruleName: "Diagnosis Limit",
      message: "Claim has more than 12 diagnosis codes.",
      suggestion: "Split the claim or reduce line-level diagnoses so diagnosis pointers fit the professional claim format.",
    });
  }

  for (const item of lineItems) {
    const code = normalizeText(item.cpt).toUpperCase();
    if (!code || !isValidProcedureCode(item)) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_PROC_CODE",
        ruleName: "Valid Procedure Code Required",
        message: `${code || "Charge line"} is not a valid CPT/HCPCS/internal charge code for its billing route.`,
        suggestion: "Use a 5-digit CPT, HCPCS code, or configured internal self-pay fee code.",
      });
    }

    if (!Number.isFinite(Number(item.units)) || Number(item.units) <= 0) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_UNITS",
        ruleName: "Units Required",
        message: `${code || "Charge line"} has invalid units.`,
        suggestion: "Set units to at least 1.",
      });
    }

    if (!Number.isFinite(Number(item.charge)) || Number(item.charge) <= 0) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_CHARGE",
        ruleName: "Charge Amount Required",
        message: `${code || "Charge line"} has no positive charge amount.`,
        suggestion: "Select a fee schedule code or enter a charge amount.",
      });
    }

    const dx = normalizeDxCodes(item.dx);
    if (isInsuranceRoutedLine(item) && dx.length === 0) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_DX_LINK",
        ruleName: "Diagnosis Link Required",
        message: `${code || "Charge line"} has no linked ICD-10 diagnosis code.`,
        suggestion: "Link the procedure line to one or more encounter diagnoses.",
      });
    }

    if (isInsuranceRoutedLine(item) && dx.length > 0 && (!item.diagnosisPointers || item.diagnosisPointers.length === 0)) {
      pushIssue(issues, {
        severity: "warning",
        ruleCode: "CORE_DX_POINTERS",
        ruleName: "Diagnosis Pointers Missing",
        message: `${code || "Charge line"} has diagnosis codes but no explicit diagnosis pointers.`,
        suggestion: "Confirm the line points to the correct diagnosis order before final submission.",
      });
    }
  }

  issues.push(...checkBuiltInDermatologyMedicalNecessity(claim));

  if (claim.patient) {
    if (!normalizeText(claim.patient.firstName) || !normalizeText(claim.patient.lastName)) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_PATIENT_NAME",
        ruleName: "Patient Name Required",
        message: "Claim patient name is incomplete.",
        suggestion: "Add first and last name to the patient profile.",
      });
    }

    if (!normalizeText(claim.patient.dob)) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_PATIENT_DOB",
        ruleName: "Patient DOB Required",
        message: "Claim patient date of birth is missing.",
        suggestion: "Add DOB to the patient profile before submission.",
      });
    }

    if (insuranceLineItems.length > 0 && !normalizeText(claim.patient.insuranceMemberId)) {
      pushIssue(issues, {
        severity: "error",
        ruleCode: "CORE_MEMBER_ID",
        ruleName: "Member ID Required",
        message: "Insurance claim is missing the patient member ID.",
        suggestion: "Add the insurance member ID or move the balance to self-pay.",
      });
    }

    const missingAddressParts = [
      !normalizeText(claim.patient.address) ? "street" : null,
      !normalizeText(claim.patient.city) ? "city" : null,
      !normalizeText(claim.patient.state) ? "state" : null,
      !normalizeText(claim.patient.zip) ? "ZIP" : null,
    ].filter(Boolean);
    if (missingAddressParts.length > 0) {
      pushIssue(issues, {
        severity: "warning",
        ruleCode: "CORE_PATIENT_ADDRESS",
        ruleName: "Patient Address Incomplete",
        message: `Patient address is missing ${missingAddressParts.join(", ")}.`,
        suggestion: "Complete demographics to reduce clearinghouse and payer rejections.",
      });
    }
  }

  if (claim.provider && !normalizeText(claim.provider.npi)) {
    pushIssue(issues, {
      severity: "error",
      ruleCode: "CORE_PROVIDER_NPI",
      ruleName: "Rendering Provider NPI Required",
      message: "Claim is missing rendering provider NPI.",
      suggestion: "Add the provider NPI in provider settings before submission.",
    });
  }

  if (claim.placeOfService !== undefined && !normalizeText(claim.placeOfService)) {
    pushIssue(issues, {
      severity: "warning",
      ruleCode: "CORE_PLACE_OF_SERVICE",
      ruleName: "Place Of Service Missing",
      message: "Claim has no place of service.",
      suggestion: "Set office place of service before final submission.",
    });
  }

  return issues;
}

/**
 * Evaluate a single scrub rule against the claim
 */
async function evaluateRule(claim: ClaimForScrubbing, rule: any): Promise<ScrubIssue[]> {
  const issues: ScrubIssue[] = [];
  const logic = rule.rule_logic;

  switch (logic.type) {
    case "missing_modifier":
      issues.push(...checkMissingModifier(claim, rule, logic));
      break;

    case "cosmetic_check":
      issues.push(...checkCosmeticProcedure(claim, rule, logic));
      break;

    case "prior_auth_check":
      issues.push(...await checkPriorAuth(claim, rule, logic));
      break;

    case "medical_necessity":
      issues.push(...checkMedicalNecessity(claim, rule, logic));
      break;

    case "duplicate_check":
      issues.push(...await checkDuplicate(claim, rule, logic));
      break;

    case "documentation_check":
      issues.push(...checkDocumentation(claim, rule, logic));
      break;

    default:
      // Unknown rule type
      break;
  }

  return issues;
}

/**
 * Check for missing modifiers
 */
function checkMissingModifier(claim: ClaimForScrubbing, rule: any, logic: any): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const conditions = logic.conditions;

  if (conditions.cpt_pattern && conditions.with_cpt_type === "procedure") {
    // Check for E/M + procedure same day needing modifier 25
    const emCodes = claim.lineItems.filter(item =>
      matchesPattern(item.cpt, conditions.cpt_pattern)
    );
    const procedureCodes = claim.lineItems.filter(item =>
      isProcedureCode(item.cpt)
    );

    if (emCodes.length > 0 && procedureCodes.length > 0) {
      // Check if E/M has modifier 25
      for (const emItem of emCodes) {
        if (!emItem.modifiers?.includes(conditions.missing_modifier)) {
          issues.push({
            severity: rule.severity,
            ruleCode: rule.rule_code,
            ruleName: rule.rule_name,
            message: `E/M code ${emItem.cpt} billed with procedure requires modifier ${conditions.missing_modifier}`,
            suggestion: logic.suggestion || `Add modifier ${conditions.missing_modifier} to ${emItem.cpt}`,
            autoFixable: logic.auto_fix || false,
            autoFixAction: logic.auto_fix ? {
              type: "add_modifier",
              cpt: emItem.cpt,
              modifier: conditions.missing_modifier,
            } : undefined,
          });
        }
      }
    }
  }

  if (conditions.multiple_procedures && conditions.different_sites) {
    // Check for multiple procedures needing modifier 59
    const procedureCodes = claim.lineItems.filter(item => isProcedureCode(item.cpt));

    if (procedureCodes.length > 1) {
      // After first procedure, subsequent ones typically need modifier 59 or X modifiers
      for (let i = 1; i < procedureCodes.length; i++) {
        const item = procedureCodes[i]!;
        const hasDistinctModifier = item.modifiers?.some(m =>
          ["59", "XE", "XS", "XP", "XU"].includes(m)
        );

        if (!hasDistinctModifier) {
          issues.push({
            severity: rule.severity,
            ruleCode: rule.rule_code,
            ruleName: rule.rule_name,
            message: `Multiple procedures may require modifier 59 or X modifiers on ${item.cpt}`,
            suggestion: logic.suggestion || "Add modifier 59, XS, or XU to distinguish this procedure",
            autoFixable: false,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for potentially cosmetic procedures
 */
function checkCosmeticProcedure(claim: ClaimForScrubbing, rule: any, logic: any): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const conditions = logic.conditions;

  const cosmeticCodes = conditions.cpt_or_hcpcs || conditions.cpt || [];

  for (const item of claim.lineItems) {
    if (cosmeticCodes.includes(item.cpt)) {
      issues.push({
        severity: rule.severity,
        ruleCode: rule.rule_code,
        ruleName: rule.rule_name,
        message: `${item.cpt} (${item.description || ""}) is often denied as cosmetic`,
        suggestion: logic.suggestion || "Verify medical necessity is documented, or mark as patient responsibility",
        autoFixable: false,
      });
    }
  }

  return issues;
}

/**
 * Check for prior authorization
 */
async function checkPriorAuth(claim: ClaimForScrubbing, rule: any, logic: any): Promise<ScrubIssue[]> {
  const issues: ScrubIssue[] = [];
  const conditions = logic.conditions;

  // Check if any line items match biologics or require PA
  const biologicCodes = claim.lineItems.filter(item =>
    conditions.hcpcs_pattern && matchesPattern(item.cpt, conditions.hcpcs_pattern)
  );

  if (biologicCodes.length > 0) {
    // Check if prior auth exists
    const paResult = await pool.query(
      `SELECT id FROM prior_authorizations
       WHERE tenant_id = $1 AND patient_id = $2 AND status = 'approved'
       AND expires_at > $3
       LIMIT 1`,
      [claim.tenantId, claim.patientId, claim.serviceDate]
    );

    if (paResult.rowCount === 0) {
      for (const item of biologicCodes) {
        issues.push({
          severity: rule.severity,
          ruleCode: rule.rule_code,
          ruleName: rule.rule_name,
          message: `${item.cpt} requires prior authorization`,
          suggestion: logic.suggestion || "Verify prior authorization is on file and active",
          autoFixable: false,
        });
      }
    }
  }

  return issues;
}

/**
 * Check medical necessity (diagnosis supports procedure)
 */
function checkMedicalNecessity(claim: ClaimForScrubbing, rule: any, logic: any): ScrubIssue[] {
  const issues: ScrubIssue[] = [];

  // Check that each line item has diagnosis codes
  for (const item of claim.lineItems) {
    if (!item.dx || item.dx.length === 0) {
      issues.push({
        severity: rule.severity,
        ruleCode: rule.rule_code,
        ruleName: rule.rule_name,
        message: `${item.cpt} has no linked diagnosis codes`,
        suggestion: "Link appropriate diagnosis codes to support medical necessity",
        autoFixable: false,
      });
    }
  }

  return issues;
}

/**
 * Check for duplicate claims
 */
async function checkDuplicate(claim: ClaimForScrubbing, rule: any, logic: any): Promise<ScrubIssue[]> {
  const issues: ScrubIssue[] = [];

  // Look for claims with same patient, service date, and similar CPT codes
  const cptCodes = claim.lineItems.map(item => item.cpt);

  const duplicateResult = await pool.query(
    `SELECT id, claim_number, status
     FROM claims
     WHERE tenant_id = $1
       AND patient_id = $2
       AND service_date = $3
       AND id != $4
       AND status IN ('submitted', 'accepted', 'paid')
     LIMIT 1`,
    [claim.tenantId, claim.patientId, claim.serviceDate, claim.id]
  );

  if (duplicateResult.rowCount && duplicateResult.rowCount > 0) {
    const duplicate = duplicateResult.rows[0];
    issues.push({
      severity: rule.severity,
      ruleCode: rule.rule_code,
      ruleName: rule.rule_name,
      message: `Possible duplicate of claim ${duplicate.claim_number} (${duplicate.status})`,
      suggestion: "Verify this is not a duplicate submission",
      autoFixable: false,
    });
  }

  return issues;
}

/**
 * Check for required documentation
 */
function checkDocumentation(claim: ClaimForScrubbing, rule: any, logic: any): ScrubIssue[] {
  const issues: ScrubIssue[] = [];
  const conditions = logic.conditions;

  const docRequiredCodes = conditions.cpt || [];

  for (const item of claim.lineItems) {
    if (docRequiredCodes.includes(item.cpt)) {
      issues.push({
        severity: rule.severity,
        ruleCode: rule.rule_code,
        ruleName: rule.rule_name,
        message: `${item.cpt} may require supporting documentation`,
        suggestion: logic.suggestion || "Ensure pathology report, photos, or body diagram are attached",
        autoFixable: false,
      });
    }
  }

  return issues;
}

/**
 * Helper: Check if CPT matches pattern
 */
function matchesPattern(cpt: string, pattern: string): boolean {
  if (!pattern) return false;

  // Simple pattern matching with * wildcard
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return regex.test(cpt);
}

/**
 * Helper: Check if code is a procedure (not E/M)
 */
function isProcedureCode(cpt: string): boolean {
  // E/M codes are 99xxx
  // Procedures are typically 10000-69999
  const code = parseInt(cpt);
  return code >= 10000 && code < 70000;
}

/**
 * Auto-fix issues where possible
 */
export function applyAutoFixes(claim: ClaimForScrubbing, issues: ScrubIssue[]): ClaimForScrubbing {
  const fixedClaim = { ...claim };

  for (const issue of issues) {
    if (issue.autoFixable && issue.autoFixAction) {
      const action = issue.autoFixAction;

      if (action.type === "add_modifier") {
        // Find line item and add modifier
        const itemIndex = fixedClaim.lineItems.findIndex(item => item.cpt === action.cpt);
        if (itemIndex >= 0) {
          const item = fixedClaim.lineItems[itemIndex]!;
          if (!item.modifiers) {
            item.modifiers = [];
          }
          if (!item.modifiers.includes(action.modifier)) {
            item.modifiers.push(action.modifier);
          }
        }
      }
    }
  }

  return fixedClaim;
}

/**
 * Get passed checks (info messages about what went well)
 */
export function getPassedChecks(claim: ClaimForScrubbing): string[] {
  const passed: string[] = [];

  // Check for diagnosis codes
  const allHaveDx = claim.lineItems.every(item => item.dx && item.dx.length > 0);
  if (allHaveDx) {
    const medicalNecessityWarnings = checkBuiltInDermatologyMedicalNecessity(claim).filter(
      (issue) => issue.severity !== "info",
    );
    if (medicalNecessityWarnings.length === 0) {
      passed.push("Diagnosis supports procedure");
    } else {
      passed.push("Diagnosis codes present");
    }
  }

  // More checks can be added
  passed.push("No duplicate claim found");

  return passed;
}
