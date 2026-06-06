import { pool } from "../db/pool";
import { logger } from "../lib/logger";

export interface InsuranceFieldsInput {
  insurance?: unknown;
  insuranceProvider?: unknown;
  payerName?: unknown;
  insuranceId?: unknown;
  insuranceMemberId?: unknown;
  memberId?: unknown;
  insuranceGroupNumber?: unknown;
  groupNumber?: unknown;
  insurancePayerId?: unknown;
  payerId?: unknown;
}

export interface NormalizedInsuranceFields {
  insuranceLabel?: string;
  payerName?: string;
  insurancePayerId?: string;
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
}

const FALLBACK_PAYERS: Array<{ payerId: string; payerName: string; aliases: string[] }> = [
  { payerId: "UHC", payerName: "UnitedHealthcare", aliases: ["united healthcare", "unitedhealthcare", "uhc", "united health care", "united health"] },
  { payerId: "UMR", payerName: "UMR", aliases: ["umr", "united medical resources"] },
  { payerId: "AETNA", payerName: "Aetna", aliases: ["aetna", "cvs aetna"] },
  { payerId: "CIGNA", payerName: "Cigna", aliases: ["cigna", "cigna healthcare"] },
  { payerId: "BCBS", payerName: "Blue Cross Blue Shield", aliases: ["bcbs", "blue cross", "blue shield", "anthem", "regence"] },
  { payerId: "HUMANA", payerName: "Humana", aliases: ["humana"] },
  { payerId: "MEDICARE", payerName: "Medicare", aliases: ["medicare", "cms"] },
  { payerId: "MEDICAID", payerName: "Medicaid", aliases: ["medicaid"] },
];

function cleanString(value: unknown): string | undefined {
  const raw = typeof value === "string"
    ? value
    : value === null || value === undefined
      ? undefined
      : String(value);
  if (raw === undefined) return undefined;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (/^(unknown|n\/a|na|none|null)$/i.test(trimmed)) return undefined;
  return trimmed || undefined;
}

function extractFirst(patterns: RegExp[], text?: string): string | undefined {
  if (!text) return undefined;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value.replace(/[.,;]+$/, "");
  }
  return undefined;
}

export function parseInsuranceLabel(insurance?: unknown): NormalizedInsuranceFields {
  const label = cleanString(insurance);
  if (!label) return {};

  const memberId = extractFirst([
    /\b(?:member|subscriber|policy)\s*(?:id|#|number|no\.?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,35})\b/i,
    /\bID\s*[:#-]\s*([A-Z0-9][A-Z0-9-]{2,35})\b/i,
  ], label);
  const groupNumber = extractFirst([
    /\b(?:group|grp)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,30})\b/i,
  ], label);

  let payerName = label
    .replace(/\s*[-|,]?\s*(?:member|subscriber|policy)?\s*id\s*[:#-]\s*[A-Z0-9-]+.*$/i, "")
    .replace(/\s*[-|,]?\s*(?:group|grp)\s*(?:number|no\.?|#)?\s*[:#-]\s*[A-Z0-9-]+.*$/i, "")
    .trim();
  payerName = payerName || label.split(/\s[-|]\s/)[0]?.trim() || label;

  return {
    insuranceLabel: label,
    payerName: cleanString(payerName),
    insuranceMemberId: memberId,
    insuranceGroupNumber: groupNumber,
  };
}

function fallbackPayerMatch(query?: string): { payerId: string; payerName: string } | null {
  const normalized = cleanString(query)?.toLowerCase();
  if (!normalized) return null;

  for (const payer of FALLBACK_PAYERS) {
    if (
      payer.payerId.toLowerCase() === normalized ||
      payer.payerName.toLowerCase() === normalized ||
      payer.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
    ) {
      return { payerId: payer.payerId, payerName: payer.payerName };
    }
  }

  return null;
}

function isOptionalSchemaError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ["42P01", "42703"].includes(String((error as { code?: string }).code || ""))
  );
}

export async function resolveInsurancePayer(tenantId: string, query?: unknown): Promise<{ payerId: string; payerName?: string } | null> {
  const normalizedQuery = cleanString(query);
  if (!normalizedQuery) return null;

  try {
    const configResult = await pool.query(
      `SELECT payer_id as "payerId", payer_name as "payerName"
       FROM payer_configurations
       WHERE (tenant_id = $1 OR tenant_id = 'default')
         AND is_active = true
         AND (
           lower(payer_id) = lower($2)
           OR lower(payer_name) = lower($2)
           OR lower(payer_name) LIKE '%' || lower($2) || '%'
           OR lower($2) LIKE '%' || lower(payer_name) || '%'
         )
       ORDER BY CASE
         WHEN lower(payer_id) = lower($2) THEN 0
         WHEN lower(payer_name) = lower($2) THEN 1
         ELSE 2
       END
       LIMIT 1`,
      [tenantId, normalizedQuery]
    );

    const configured = configResult.rows[0];
    if (configured?.payerId) {
      return { payerId: configured.payerId, payerName: configured.payerName };
    }
  } catch (error) {
    if (!isOptionalSchemaError(error)) {
      logger.warn("Could not resolve payer from payer_configurations", { error: (error as Error).message });
    }
  }

  try {
    const knownResult = await pool.query(
      `SELECT payer_id as "payerId", payer_name as "payerName"
       FROM known_payers kp
       WHERE coalesce(to_jsonb(kp)->>'is_active', 'true') <> 'false'
         AND (
           lower(payer_id) = lower($1)
           OR lower(payer_name) = lower($1)
           OR lower(payer_name) LIKE '%' || lower($1) || '%'
           OR lower($1) LIKE '%' || lower(payer_name) || '%'
           OR lower(coalesce(to_jsonb(kp)->>'payer_aliases', '')) LIKE '%' || lower($1) || '%'
         )
       ORDER BY CASE
         WHEN lower(payer_id) = lower($1) THEN 0
         WHEN lower(payer_name) = lower($1) THEN 1
         ELSE 2
       END
       LIMIT 1`,
      [normalizedQuery]
    );

    const known = knownResult.rows[0];
    if (known?.payerId) {
      return { payerId: known.payerId, payerName: known.payerName };
    }
  } catch (error) {
    if (!isOptionalSchemaError(error)) {
      logger.warn("Could not resolve payer from known_payers", { error: (error as Error).message });
    }
  }

  return fallbackPayerMatch(normalizedQuery);
}

export async function normalizeInsuranceFields(
  tenantId: string,
  input: InsuranceFieldsInput
): Promise<NormalizedInsuranceFields> {
  const parsed = parseInsuranceLabel(input.insurance);
  const explicitPayerId = cleanString(input.insurancePayerId) || cleanString(input.payerId);
  const explicitPayerName = cleanString(input.payerName) || cleanString(input.insuranceProvider);
  const payerSearch = explicitPayerId || explicitPayerName || parsed.payerName || parsed.insuranceLabel;
  const resolvedPayer = explicitPayerId
    ? { payerId: explicitPayerId, payerName: explicitPayerName || parsed.payerName }
    : await resolveInsurancePayer(tenantId, payerSearch);

  return {
    insuranceLabel: parsed.insuranceLabel,
    payerName: explicitPayerName || resolvedPayer?.payerName || parsed.payerName,
    insurancePayerId: resolvedPayer?.payerId,
    insuranceMemberId:
      cleanString(input.insuranceMemberId) ||
      cleanString(input.memberId) ||
      cleanString(input.insuranceId) ||
      parsed.insuranceMemberId,
    insuranceGroupNumber:
      cleanString(input.insuranceGroupNumber) ||
      cleanString(input.groupNumber) ||
      parsed.insuranceGroupNumber,
  };
}
