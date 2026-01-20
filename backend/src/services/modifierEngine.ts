import { pool } from "../db/pool";

export interface ModifierSuggestion {
  modifier: string;
  name: string;
  description: string;
  reason: string;
  required: boolean;
  confidence: "high" | "medium" | "low";
}

export interface ClaimLineItem {
  cpt: string;
  modifiers?: string[];
  dx: string[];
  units: number;
  charge: number;
  description?: string;
}

/**
 * Determine required and suggested modifiers for a claim
 */
export async function suggestModifiers(
  tenantId: string,
  lineItems: ClaimLineItem[]
): Promise<ModifierSuggestion[]> {
  const suggestions: ModifierSuggestion[] = [];

  // Load modifier rules
  const rulesResult = await pool.query(
    `SELECT modifier_code, modifier_name, description, when_to_use, rule_logic, examples
     FROM modifier_rules
     WHERE is_active = true
     ORDER BY modifier_code`,
    []
  );

  const rules = rulesResult.rows;

  // Analyze claim for modifier needs
  const emCodes = lineItems.filter(item => isEMCode(item.cpt));
  const procedureCodes = lineItems.filter(item => isProcedureCode(item.cpt));

  // Check for modifier 25: E/M + procedure same day
  if (emCodes.length > 0 && procedureCodes.length > 0) {
    for (const emItem of emCodes) {
      if (!emItem.modifiers?.includes("25")) {
        const rule = rules.find(r => r.modifier_code === "25");
        suggestions.push({
          modifier: "25",
          name: rule?.modifier_name || "Significant, Separately Identifiable E/M",
          description: rule?.description || "E/M service is significant and separately identifiable",
          reason: `E/M code ${emItem.cpt} billed with procedure ${procedureCodes[0]!.cpt} requires modifier 25`,
          required: true,
          confidence: "high",
        });
      }
    }
  }

  // Check for modifier 59/X modifiers: Multiple procedures
  if (procedureCodes.length > 1) {
    for (let i = 1; i < procedureCodes.length; i++) {
      const item = procedureCodes[i]!;
      const hasDistinctModifier = item.modifiers?.some(m =>
        ["59", "XE", "XS", "XP", "XU"].includes(m)
      );

      if (!hasDistinctModifier) {
        const rule59 = rules.find(r => r.modifier_code === "59");
        const ruleXS = rules.find(r => r.modifier_code === "XS");

        suggestions.push({
          modifier: "59",
          name: rule59?.modifier_name || "Distinct Procedural Service",
          description: rule59?.description || "Procedure is distinct from other services",
          reason: `Multiple procedures require modifier 59 or X modifiers on ${item.cpt}`,
          required: true,
          confidence: "high",
        });

        // Also suggest XS as alternative
        suggestions.push({
          modifier: "XS",
          name: ruleXS?.modifier_name || "Separate Structure",
          description: ruleXS?.description || "Service performed on separate structure",
          reason: `Alternative to 59 if procedures are on different anatomical structures`,
          required: false,
          confidence: "medium",
        });
      }
    }
  }

  // Check for modifier 76/77: Repeat procedures
  const cptCounts = countCPTCodes(lineItems);
  for (const [cpt, count] of Object.entries(cptCounts)) {
    if (count > 1) {
      const items = lineItems.filter(item => item.cpt === cpt);
      for (let i = 1; i < items.length; i++) {
        if (!items[i]!.modifiers?.includes("76") && !items[i]!.modifiers?.includes("77")) {
          const rule76 = rules.find(r => r.modifier_code === "76");
          suggestions.push({
            modifier: "76",
            name: rule76?.modifier_name || "Repeat Procedure by Same Physician",
            description: rule76?.description || "Procedure repeated by same physician",
            reason: `${cpt} appears multiple times - use modifier 76 if repeated by same provider`,
            required: false,
            confidence: "medium",
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Get detailed information about a specific modifier
 */
export async function getModifierInfo(modifierCode: string): Promise<any> {
  const result = await pool.query(
    `SELECT modifier_code, modifier_name, description, when_to_use, examples
     FROM modifier_rules
     WHERE modifier_code = $1 AND is_active = true`,
    [modifierCode]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Get all modifier rules for display/education
 */
export async function getAllModifierRules(): Promise<any[]> {
  const result = await pool.query(
    `SELECT modifier_code, modifier_name, description, when_to_use, examples
     FROM modifier_rules
     WHERE is_active = true AND specialty = 'dermatology'
     ORDER BY modifier_code`,
    []
  );

  return result.rows;
}

/**
 * Validate modifiers on a claim
 */
export function validateModifiers(lineItems: ClaimLineItem[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  for (const item of lineItems) {
    if (item.modifiers) {
      // Check for conflicting modifiers
      if (item.modifiers.includes("59")) {
        const xModifiers = item.modifiers.filter(m => ["XE", "XS", "XP", "XU"].includes(m));
        if (xModifiers.length > 0) {
          issues.push(`${item.cpt}: Cannot use modifier 59 with X modifiers (${xModifiers.join(", ")})`);
        }
      }

      // Check for duplicate modifiers
      const uniqueModifiers = new Set(item.modifiers);
      if (uniqueModifiers.size !== item.modifiers.length) {
        issues.push(`${item.cpt}: Duplicate modifiers found`);
      }

      // Check for invalid modifier combinations
      if (item.modifiers.includes("76") && item.modifiers.includes("77")) {
        issues.push(`${item.cpt}: Cannot use both modifier 76 and 77`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Apply suggested modifiers to line items
 */
export function applySuggestedModifiers(
  lineItems: ClaimLineItem[],
  suggestions: ModifierSuggestion[]
): ClaimLineItem[] {
  const updatedItems = lineItems.map(item => ({ ...item }));

  // Only apply required/high-confidence suggestions
  const toApply = suggestions.filter(s => s.required && s.confidence === "high");

  for (const suggestion of toApply) {
    // Find the appropriate line item to add modifier to
    if (suggestion.modifier === "25") {
      // Add to E/M codes
      const emItems = updatedItems.filter(item => isEMCode(item.cpt));
      for (const item of emItems) {
        if (!item.modifiers) item.modifiers = [];
        if (!item.modifiers.includes(suggestion.modifier)) {
          item.modifiers.push(suggestion.modifier);
        }
      }
    } else if (["59", "XS", "XE", "XP", "XU"].includes(suggestion.modifier)) {
      // Add to subsequent procedures
      const procedureItems = updatedItems.filter(item => isProcedureCode(item.cpt));
      for (let i = 1; i < procedureItems.length; i++) {
        if (!procedureItems[i]!.modifiers) procedureItems[i]!.modifiers = [];
        if (!procedureItems[i]!.modifiers!.includes(suggestion.modifier)) {
          procedureItems[i]!.modifiers!.push(suggestion.modifier);
          break; // Only add to first item that needs it
        }
      }
    }
  }

  return updatedItems;
}

/**
 * Get modifier explanation for patient/staff
 */
export function explainModifier(modifierCode: string): string {
  const explanations: { [key: string]: string } = {
    "25": "This modifier indicates that the office visit (E/M service) was significant and separately identifiable from the procedure performed on the same day. The doctor did more than just perform the procedure - they also evaluated the patient for other concerns.",
    "59": "This modifier indicates that the procedure was distinct or independent from other procedures performed. For example, treating lesions on different body parts.",
    "76": "This modifier indicates that the same procedure was repeated by the same doctor on the same day.",
    "77": "This modifier indicates that the same procedure was repeated by a different doctor on the same day.",
    "XE": "This modifier (subset of 59) indicates that the service was performed during a separate patient encounter on the same date.",
    "XS": "This modifier (subset of 59) indicates that the service was performed on a separate organ or structure.",
    "XP": "This modifier (subset of 59) indicates that the service was performed by a different practitioner.",
    "XU": "This modifier (subset of 59) indicates an unusual non-overlapping service that doesn't fit the other X modifier categories.",
  };

  return explanations[modifierCode] || "Modifier explanation not available.";
}

/**
 * Helper: Check if code is E/M
 */
function isEMCode(cpt: string): boolean {
  const code = parseInt(cpt);
  return code >= 99000 && code <= 99999;
}

/**
 * Helper: Check if code is a procedure
 */
function isProcedureCode(cpt: string): boolean {
  const code = parseInt(cpt);
  return code >= 10000 && code < 70000;
}

/**
 * Helper: Count occurrences of each CPT code
 */
function countCPTCodes(lineItems: ClaimLineItem[]): { [cpt: string]: number } {
  const counts: { [cpt: string]: number } = {};

  for (const item of lineItems) {
    counts[item.cpt] = (counts[item.cpt] || 0) + 1;
  }

  return counts;
}

/**
 * Determine if modifiers are required for a specific CPT combination
 */
export function checkModifierRequirements(lineItems: ClaimLineItem[]): {
  cpt: string;
  requiredModifiers: string[];
  reason: string;
}[] {
  const requirements: { cpt: string; requiredModifiers: string[]; reason: string }[] = [];

  const emCodes = lineItems.filter(item => isEMCode(item.cpt));
  const procedureCodes = lineItems.filter(item => isProcedureCode(item.cpt));

  // E/M + procedure = modifier 25 required
  if (emCodes.length > 0 && procedureCodes.length > 0) {
    for (const emItem of emCodes) {
      if (!emItem.modifiers?.includes("25")) {
        requirements.push({
          cpt: emItem.cpt,
          requiredModifiers: ["25"],
          reason: "E/M service billed with procedure on same day",
        });
      }
    }
  }

  // Multiple procedures = modifier 59 or X required
  if (procedureCodes.length > 1) {
    for (let i = 1; i < procedureCodes.length; i++) {
      const item = procedureCodes[i]!;
      const hasDistinctModifier = item.modifiers?.some(m =>
        ["59", "XE", "XS", "XP", "XU"].includes(m)
      );

      if (!hasDistinctModifier) {
        requirements.push({
          cpt: item.cpt,
          requiredModifiers: ["59", "XS", "XE", "XP", "XU"],
          reason: "Multiple procedures require distinct service modifier",
        });
      }
    }
  }

  return requirements;
}
