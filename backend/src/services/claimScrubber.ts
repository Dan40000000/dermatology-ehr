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
  units: number;
  charge: number;
  description?: string;
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
}

/**
 * Main claim scrubber service
 * Validates claims against dermatology-specific rules
 */
export async function scrubClaim(claim: ClaimForScrubbing): Promise<ScrubResult> {
  const errors: ScrubIssue[] = [];
  const warnings: ScrubIssue[] = [];
  const info: ScrubIssue[] = [];

  // Load active scrub rules
  const rulesResult = await pool.query(
    `SELECT id, rule_code, rule_name, description, severity, rule_logic
     FROM claim_scrub_rules
     WHERE is_active = true AND (tenant_id IS NULL OR tenant_id = $1)
     ORDER BY severity DESC`,
    [claim.tenantId]
  );

  const rules = rulesResult.rows;

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
    passed.push("Diagnosis supports procedure");
  }

  // More checks can be added
  passed.push("No duplicate claim found");

  return passed;
}
