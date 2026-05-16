import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

const LIVE_CODING_SOURCE = "live_documentation_coding";
const LOCKED_CHARGE_STATUSES = new Set(["submitted", "claimed", "paid", "denied", "voided"]);
const LOCKED_SUPERBILL_STATUSES = new Set(["finalized", "submitted", "posted", "void"]);

type BillingRoute = "insurance" | "self_pay" | "non_billable";
type CodeType = "CPT" | "HCPCS" | "INTERNAL";

export interface LiveCodingNoteInput {
  chiefComplaint?: string | null;
  hpi?: string | null;
  ros?: string | null;
  exam?: string | null;
  assessmentPlan?: string | null;
}

interface DiagnosisRule {
  code: string;
  label: string;
  patterns: RegExp[];
  priority: number;
}

interface ProcedureRule {
  code: string;
  description: string;
  patterns: RegExp[];
  chargeGroup: string;
  reason: string;
  quantity?: number;
}

export interface LiveCodingDiagnosisSuggestion {
  code: string;
  description: string;
  label: string;
  evidence: string[];
  isPrimary: boolean;
  existing: boolean;
}

export interface LiveCodingChargeSuggestion {
  cptCode: string;
  description: string;
  codeType: CodeType;
  billingRoute: BillingRoute;
  feeCents: number;
  amountCents: number;
  quantity: number;
  reason: string;
  existing: boolean;
}

export interface LiveCodingSyncResult {
  diagnoses: Array<{
    id: string;
    encounterId: string;
    icd10Code: string;
    description: string;
    isPrimary: boolean;
    createdAt: string;
  }>;
  charges: Array<{
    id: string;
    encounterId?: string;
    cptCode: string;
    codeType?: CodeType;
    billingRoute?: BillingRoute;
    description?: string;
    icdCodes?: string[];
    linkedDiagnosisIds?: string[];
    quantity?: number;
    feeCents?: number;
    amountCents: number;
    modifierCodes?: string[];
    source?: string;
    chargeGroup?: string;
    lineNote?: string;
    status: string;
    createdAt: string;
  }>;
  superbill: {
    id: string;
    status: string;
    lineCount: number;
    totalChargesCents: number;
  } | null;
  suggestions: {
    diagnoses: LiveCodingDiagnosisSuggestion[];
    charges: LiveCodingChargeSuggestion[];
  };
  applied: {
    diagnosesCreated: number;
    chargesCreated: number;
    chargesUpdated: number;
    superbillLinesSynced: number;
  };
  warnings: string[];
}

const DIAGNOSIS_RULES: DiagnosisRule[] = [
  {
    code: "D48.5",
    label: "Neoplasm of uncertain behavior of skin",
    priority: 95,
    patterns: [
      /\b(changing|growing|bleeding|irregular|suspicious)\s+(mole|nevus|lesion|spot)\b/i,
      /\brule\s*out\s*(melanoma|skin cancer)\b/i,
      /\bneoplasm of uncertain behavior\b/i,
      /\bshave biopsy\b/i,
      /\bpunch biopsy\b/i,
    ],
  },
  {
    code: "C43.9",
    label: "Malignant melanoma of skin, unspecified",
    priority: 90,
    patterns: [/\bmalignant melanoma\b/i, /\b(diagnosed|confirmed|pathology (shows|showed|consistent with))\s+melanoma\b/i],
  },
  {
    code: "C44.91",
    label: "Basal cell carcinoma of skin, unspecified",
    priority: 86,
    patterns: [/\bbasal cell carcinoma\b/i, /\b\bcc\b/i],
  },
  {
    code: "C44.92",
    label: "Squamous cell carcinoma of skin, unspecified",
    priority: 85,
    patterns: [/\bsquamous cell carcinoma\b/i, /\b\bscc\b/i],
  },
  {
    code: "L57.0",
    label: "Actinic keratosis",
    priority: 80,
    patterns: [/\bactinic keratos(is|es)\b/i, /\bAKs?\b/],
  },
  {
    code: "L82.1",
    label: "Seborrheic keratosis",
    priority: 70,
    patterns: [/\bseborrheic keratos(is|es)\b/i, /\bstuck[- ]on\b/i],
  },
  {
    code: "L70.0",
    label: "Acne vulgaris",
    priority: 65,
    patterns: [/\bacne vulgaris\b/i, /\bcomedonal acne\b/i, /\binflammatory acne\b/i],
  },
  {
    code: "L20.9",
    label: "Atopic dermatitis",
    priority: 64,
    patterns: [/\batopic dermatitis\b/i, /\beczema\b/i],
  },
  {
    code: "L40.9",
    label: "Psoriasis",
    priority: 63,
    patterns: [/\bpsoriasis\b/i, /\bpsoriatic plaques?\b/i],
  },
  {
    code: "L30.9",
    label: "Dermatitis, unspecified",
    priority: 62,
    patterns: [/\bdermatitis\b/i, /\brash\b/i],
  },
  {
    code: "L21.9",
    label: "Seborrheic dermatitis",
    priority: 61,
    patterns: [/\bseborrheic dermatitis\b/i, /\bseb derm\b/i, /\bdandruff\b/i],
  },
  {
    code: "L71.9",
    label: "Rosacea, unspecified",
    priority: 60,
    patterns: [/\brosacea\b/i],
  },
  {
    code: "B07.9",
    label: "Viral wart, unspecified",
    priority: 59,
    patterns: [/\bwart(s)?\b/i, /\bverruca\b/i],
  },
  {
    code: "D22.9",
    label: "Melanocytic nevi, unspecified",
    priority: 58,
    patterns: [/\bbenign nev(us|i)\b/i, /\bmelanocytic nev(us|i)\b/i],
  },
  {
    code: "Z12.83",
    label: "Encounter for screening for malignant neoplasm of skin",
    priority: 50,
    patterns: [/\bskin check\b/i, /\bfull body skin exam\b/i, /\bfbse\b/i, /\bskin cancer screening\b/i],
  },
  {
    code: "Z80.8",
    label: "Family history of malignant neoplasm",
    priority: 49,
    patterns: [
      /\bfamily history of (melanoma|skin cancer|cutaneous malignancy)\b/i,
      /\b(father|mother|parent|sibling|brother|sister|child)\s+(had|has|with|diagnosed with)\s+(melanoma|skin cancer)\b/i,
    ],
  },
  {
    code: "Z85.820",
    label: "Personal history of malignant melanoma of skin",
    priority: 48,
    patterns: [
      /\b(personal|prior|past|previous)\s+history of melanoma\b/i,
      /\bpatient\s+(has|had)\s+(a\s+)?history of melanoma\b/i,
      /\bmelanoma surveillance\b/i,
    ],
  },
  {
    code: "Z85.828",
    label: "Personal history of other malignant neoplasm of skin",
    priority: 47,
    patterns: [
      /\b(personal|prior|past|previous)\s+history of (bcc|scc|non[- ]melanoma skin cancer|skin cancer)\b/i,
      /\bpatient\s+(has|had)\s+(a\s+)?history of (bcc|scc|non[- ]melanoma skin cancer|skin cancer)\b/i,
    ],
  },
];

const PROCEDURE_RULES: ProcedureRule[] = [
  {
    code: "11102",
    description: "Tangential skin biopsy, first lesion",
    chargeGroup: "Biopsy",
    reason: "Documentation mentions a tangential/shave biopsy.",
    patterns: [/\b(shave|tangential)\s+biopsy\b/i],
  },
  {
    code: "11104",
    description: "Punch skin biopsy, first lesion",
    chargeGroup: "Biopsy",
    reason: "Documentation mentions a punch biopsy.",
    patterns: [/\bpunch\s+biopsy\b/i],
  },
  {
    code: "17000",
    description: "Destruction of premalignant lesion, first lesion",
    chargeGroup: "Destruction/Cryotherapy",
    reason: "Documentation mentions cryotherapy or destruction for actinic/premalignant lesions.",
    patterns: [/\bcryotherapy\b/i, /\bliquid nitrogen\b/i, /\bLN2\b/, /\bdestruction\b/i],
  },
  {
    code: "17110",
    description: "Destruction of benign lesions, up to 14 lesions",
    chargeGroup: "Destruction/Cryotherapy",
    reason: "Documentation mentions wart/benign lesion destruction.",
    patterns: [/\bwart(s)?.*(cryotherapy|destruction|liquid nitrogen|LN2)\b/i, /\bverruca.*(cryotherapy|destruction|liquid nitrogen|LN2)\b/i],
  },
  {
    code: "11900",
    description: "Intralesional injection, up to 7 lesions",
    chargeGroup: "Injection",
    reason: "Documentation mentions intralesional injection.",
    patterns: [/\bintralesional\b/i, /\bILK\b/, /\bkenalog injection\b/i],
  },
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildDocumentationText(input: LiveCodingNoteInput): string {
  return [
    input.chiefComplaint,
    input.hpi,
    input.ros,
    input.exam,
    input.assessmentPlan,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
}

function evidenceForRule(text: string, patterns: RegExp[]): string[] {
  const evidence: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) evidence.push(match[0]);
  }
  return Array.from(new Set(evidence)).slice(0, 3);
}

export function suggestLiveCodingFromDocumentation(
  input: LiveCodingNoteInput
): {
  diagnosisRules: Array<DiagnosisRule & { evidence: string[]; isPrimary: boolean }>;
  procedureRules: Array<ProcedureRule & { evidence: string[] }>;
  emCode: "99213" | "99214" | null;
  warnings: string[];
} {
  const text = buildDocumentationText(input);
  const normalized = normalizeText(text);
  const warnings: string[] = [];

  if (normalized.length < 20) {
    return { diagnosisRules: [], procedureRules: [], emCode: null, warnings: ["Add more documentation to generate live coding suggestions."] };
  }

  let diagnosisRules = DIAGNOSIS_RULES
    .map((rule) => ({ ...rule, evidence: evidenceForRule(text, rule.patterns), isPrimary: false }))
    .filter((rule) => rule.evidence.length > 0)
    .sort((a, b) => b.priority - a.priority);

  if (diagnosisRules.some((rule) => ["L20.9", "L21.9"].includes(rule.code))) {
    diagnosisRules = diagnosisRules.filter((rule) => rule.code !== "L30.9");
  }

  diagnosisRules = diagnosisRules.slice(0, 8);

  if (diagnosisRules.length > 0) {
    diagnosisRules[0]!.isPrimary = true;
  }

  const procedureRules = PROCEDURE_RULES
    .map((rule) => ({ ...rule, evidence: evidenceForRule(text, rule.patterns) }))
    .filter((rule) => rule.evidence.length > 0);

  const lower = normalized.toLowerCase();
  const noteSectionsDocumented = [
    input.chiefComplaint,
    input.hpi,
    input.exam,
    input.assessmentPlan,
  ].filter((value) => typeof value === "string" && value.trim().length >= 10).length;

  const higherComplexity =
    procedureRules.length > 0 ||
    /\b(biopsy|pathology|suspicious|melanoma|skin cancer|systemic|prescription|start(ed)?|increase|worsening)\b/i.test(normalized) ||
    diagnosisRules.length >= 2 ||
    noteSectionsDocumented >= 4;

  const hasVisitDocumentation =
    /\b(exam|assessment|plan|follow[- ]?up|return|patient presents|skin check|rash|mole|lesion)\b/i.test(normalized);

  if (lower.includes("excision") || lower.includes("mohs")) {
    warnings.push("Excision/Mohs codes require site, size, stage, margins, and repair details. Review before billing.");
  }

  return {
    diagnosisRules,
    procedureRules,
    emCode: hasVisitDocumentation ? (higherComplexity ? "99214" : "99213") : null,
    warnings,
  };
}

async function resolveOfficialDiagnoses(codes: string[]): Promise<Map<string, { code: string; description: string }>> {
  if (codes.length === 0) return new Map();
  const result = await pool.query(
    `select code, description
     from icd10_codes
     where replace(upper(code), '.', '') = any($1::text[])`,
    [codes.map((code) => code.replace(/\./g, "").toUpperCase())],
  );

  return new Map(result.rows.map((row) => [String(row.code).toUpperCase(), {
    code: String(row.code).toUpperCase(),
    description: String(row.description || ""),
  }]));
}

async function lookupChargeCode(
  tenantId: string,
  code: string
): Promise<{ code: string; description: string; feeCents: number; codeType: CodeType; billingRoute: BillingRoute }> {
  const result = await pool.query(
    `with tenant_fee_items as (
       select distinct on (upper(fsi.cpt_code))
         fsi.cpt_code,
         nullif(fsi.cpt_description, '') as cpt_description,
         coalesce(fsi.fee_cents, round(fsi.fee_amount * 100)::int, 0) as fee_cents,
         nullif(to_jsonb(fsi)->>'code_type', '') as code_type,
         nullif(to_jsonb(fsi)->>'billing_route', '') as billing_route,
         coalesce(nullif(to_jsonb(fsi)->>'is_cosmetic', '')::boolean, false) as is_cosmetic
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
       where fs.tenant_id = $1
         and upper(fsi.cpt_code) = upper($2)
       order by upper(fsi.cpt_code), fs.is_default desc, fsi.updated_at desc nulls last, fsi.created_at desc
     )
     select
       coalesce(tfi.cpt_code, c.code, $2) as code,
       coalesce(tfi.cpt_description, c.description, $2) as description,
       coalesce(tfi.fee_cents, c.default_fee_cents, 0) as "feeCents",
       coalesce(tfi.code_type, nullif(to_jsonb(c)->>'code_type', ''),
         case when coalesce(tfi.cpt_code, c.code, $2) ~ '^[0-9]{5}$' then 'CPT' else 'HCPCS' end
       ) as "codeType",
       coalesce(tfi.billing_route, nullif(to_jsonb(c)->>'billing_route', ''),
         case when coalesce(tfi.cpt_code, c.code, $2) ~ '^[0-9]{5}$' then 'insurance' else 'insurance' end
       ) as "billingRoute"
     from tenant_fee_items tfi
     full outer join cpt_codes c on upper(c.code) = upper(tfi.cpt_code)
     where upper(coalesce(tfi.cpt_code, c.code, $2)) = upper($2)
     limit 1`,
    [tenantId, code],
  );

  const row = result.rows[0] || {};
  const normalizedCode = String(row.code || code).toUpperCase();
  const codeType = String(row.codeType || "CPT").toUpperCase() as CodeType;
  const billingRoute = String(row.billingRoute || "insurance") as BillingRoute;
  return {
    code: normalizedCode,
    description: String(row.description || normalizedCode),
    feeCents: Number(row.feeCents || 0),
    codeType,
    billingRoute,
  };
}

async function loadEncounter(tenantId: string, encounterId: string) {
  const result = await pool.query(
    `select e.id,
            e.patient_id as "patientId",
            e.provider_id as "providerId",
            e.status,
            e.created_at as "createdAt",
            e.chief_complaint as "chiefComplaint",
            e.hpi,
            e.ros,
            e.exam,
            e.assessment_plan as "assessmentPlan",
            coalesce(a.scheduled_start::date, e.created_at::date, current_date) as "serviceDate"
     from encounters e
     left join appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
     where e.id = $1 and e.tenant_id = $2
     limit 1`,
    [encounterId, tenantId],
  );
  return result.rows[0] || null;
}

async function fetchEncounterDiagnoses(tenantId: string, encounterId: string): Promise<LiveCodingSyncResult["diagnoses"]> {
  const result = await pool.query(
    `select id,
            encounter_id as "encounterId",
            icd10_code as "icd10Code",
            description,
            is_primary as "isPrimary",
            created_at as "createdAt"
     from encounter_diagnoses
     where tenant_id = $1 and encounter_id = $2
     order by is_primary desc, created_at asc`,
    [tenantId, encounterId],
  );
  return result.rows;
}

async function fetchEncounterCharges(tenantId: string, encounterId: string): Promise<LiveCodingSyncResult["charges"]> {
  const result = await pool.query(
    `select id,
            encounter_id as "encounterId",
            cpt_code as "cptCode",
            coalesce(nullif(to_jsonb(charges)->>'code_type', ''), 'CPT') as "codeType",
            coalesce(nullif(to_jsonb(charges)->>'billing_route', ''), case when status = 'self_pay' then 'self_pay' else 'insurance' end) as "billingRoute",
            description,
            coalesce(icd_codes, array[]::text[]) as "icdCodes",
            coalesce(linked_diagnosis_ids, array[]::text[]) as "linkedDiagnosisIds",
            quantity,
            fee_cents as "feeCents",
            amount_cents as "amountCents",
            coalesce(modifier_codes, array[]::text[]) as "modifierCodes",
            source,
            charge_group as "chargeGroup",
            line_note as "lineNote",
            status,
            created_at as "createdAt"
     from charges
     where tenant_id = $1 and encounter_id = $2
     order by created_at asc`,
    [tenantId, encounterId],
  );
  return result.rows;
}

async function upsertDiagnosis(
  tenantId: string,
  encounterId: string,
  code: string,
  description: string,
  isPrimary: boolean
): Promise<{ id: string; created: boolean }> {
  const existing = await pool.query(
    `select id
     from encounter_diagnoses
     where tenant_id = $1
       and encounter_id = $2
       and replace(upper(icd10_code), '.', '') = replace(upper($3), '.', '')
     limit 1`,
    [tenantId, encounterId, code],
  );

  if (existing.rows[0]?.id) {
    if (isPrimary) {
      await pool.query(
        `update encounter_diagnoses set is_primary = false
         where tenant_id = $1 and encounter_id = $2 and id <> $3`,
        [tenantId, encounterId, existing.rows[0].id],
      );
      await pool.query(
        `update encounter_diagnoses set is_primary = true, description = $1
         where tenant_id = $2 and id = $3`,
        [description, tenantId, existing.rows[0].id],
      );
    }
    return { id: existing.rows[0].id, created: false };
  }

  if (isPrimary) {
    await pool.query(
      `update encounter_diagnoses set is_primary = false
       where tenant_id = $1 and encounter_id = $2`,
      [tenantId, encounterId],
    );
  }

  const id = crypto.randomUUID();
  await pool.query(
    `insert into encounter_diagnoses(id, tenant_id, encounter_id, icd10_code, description, is_primary)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, tenantId, encounterId, code, description, isPrimary],
  );

  return { id, created: true };
}

async function upsertLiveCharge(options: {
  tenantId: string;
  encounterId: string;
  patientId: string;
  serviceDate: string;
  cptCode: string;
  description: string;
  codeType: CodeType;
  billingRoute: BillingRoute;
  quantity: number;
  feeCents: number;
  linkedDiagnosisIds: string[];
  icdCodes: string[];
  chargeGroup: string;
  lineNote: string;
}): Promise<{ created: boolean; updated: boolean }> {
  const existingAny = await pool.query(
    `select id, source, status
     from charges
     where tenant_id = $1
       and encounter_id = $2
       and upper(cpt_code) = upper($3)
     order by case when source = $4 then 0 else 1 end, created_at asc
     limit 1`,
    [options.tenantId, options.encounterId, options.cptCode, LIVE_CODING_SOURCE],
  );

  const amountCents = options.feeCents * options.quantity;
  const patientResponsibilityCents = options.billingRoute === "self_pay" ? amountCents : 0;
  const insuranceResponsibilityCents = options.billingRoute === "insurance" ? amountCents : 0;

  if (existingAny.rows[0]?.id) {
    const existing = existingAny.rows[0];
    if (existing.source !== LIVE_CODING_SOURCE || LOCKED_CHARGE_STATUSES.has(String(existing.status || ""))) {
      return { created: false, updated: false };
    }

    await pool.query(
      `update charges
       set description = $1,
           code_type = $2,
           billing_route = $3,
           quantity = $4,
           fee_cents = $5,
           amount_cents = $6,
           amount = round(($6::numeric / 100), 2),
           linked_diagnosis_ids = $7,
           icd_codes = $8,
           charge_group = $9,
           line_note = $10,
           patient_responsibility_cents = $11,
           insurance_responsibility_cents = $12
       where id = $13 and tenant_id = $14`,
      [
        options.description,
        options.codeType,
        options.billingRoute,
        options.quantity,
        options.feeCents,
        amountCents,
        options.linkedDiagnosisIds,
        options.icdCodes,
        options.chargeGroup,
        options.lineNote,
        patientResponsibilityCents,
        insuranceResponsibilityCents,
        existing.id,
        options.tenantId,
      ],
    );
    return { created: false, updated: true };
  }

  await pool.query(
    `insert into charges(
       id, tenant_id, encounter_id, patient_id, service_date,
       cpt_code, code_type, billing_route, description, icd_codes, linked_diagnosis_ids,
       quantity, fee_cents, amount_cents, amount, status, source, charge_group, line_note,
       patient_responsibility_cents, insurance_responsibility_cents
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::int,round(($14::numeric / 100), 2),$15,$16,$17,$18,$19,$20)`,
    [
      crypto.randomUUID(),
      options.tenantId,
      options.encounterId,
      options.patientId,
      options.serviceDate,
      options.cptCode,
      options.codeType,
      options.billingRoute,
      options.description,
      options.icdCodes,
      options.linkedDiagnosisIds,
      options.quantity,
      options.feeCents,
      amountCents,
      options.billingRoute === "self_pay" ? "self_pay" : "pending",
      LIVE_CODING_SOURCE,
      options.chargeGroup,
      options.lineNote,
      patientResponsibilityCents,
      insuranceResponsibilityCents,
    ],
  );

  return { created: true, updated: false };
}

async function syncDraftSuperbill(options: {
  tenantId: string;
  encounterId: string;
  patientId: string;
  providerId: string;
  serviceDate: string;
  userId: string;
  diagnoses: LiveCodingSyncResult["diagnoses"];
  charges: LiveCodingSyncResult["charges"];
}): Promise<LiveCodingSyncResult["superbill"]> {
  try {
    let superbillId: string;
    const existing = await pool.query(
      `select id, status
       from superbills
       where tenant_id = $1 and encounter_id = $2
       limit 1`,
      [options.tenantId, options.encounterId],
    );

    if (existing.rows[0]?.id) {
      if (LOCKED_SUPERBILL_STATUSES.has(String(existing.rows[0].status || ""))) {
        return {
          id: existing.rows[0].id,
          status: existing.rows[0].status,
          lineCount: 0,
          totalChargesCents: 0,
        };
      }
      superbillId = existing.rows[0].id;
    } else {
      superbillId = crypto.randomUUID();
      await pool.query(
        `insert into superbills(
           id, tenant_id, encounter_id, patient_id, provider_id, service_date, status,
           diagnosis_codes, primary_diagnosis, notes, created_by
         )
         values ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,(select id from users where id = $10 and tenant_id = $2 limit 1))`,
        [
          superbillId,
          options.tenantId,
          options.encounterId,
          options.patientId,
          options.providerId,
          options.serviceDate,
          options.diagnoses.map((diagnosis) => diagnosis.icd10Code),
          options.diagnoses.find((diagnosis) => diagnosis.isPrimary)?.icd10Code || null,
          "Auto-created by live documentation coding. Review before submission.",
          options.userId,
        ],
      );
    }

    await pool.query(
      `delete from superbill_line_items
       where superbill_id = $1 and coalesce(source, '') = $2 and coalesce(is_auto_captured, false) = true`,
      [superbillId, LIVE_CODING_SOURCE],
    );

    const liveCharges = options.charges.filter((charge) => charge.source === LIVE_CODING_SOURCE);
    for (const [index, charge] of liveCharges.entries()) {
      const feeCents = Number(charge.feeCents || 0);
      const quantity = Number(charge.quantity || 1);
      const unitCharge = feeCents / 100;
      const totalCharge = (Number(charge.amountCents || feeCents * quantity)) / 100;
      await pool.query(
        `insert into superbill_line_items(
           id, superbill_id, cpt_code, description, units, unit_charge, total_charge,
           diagnosis_pointers, is_auto_captured, source, line_number
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)`,
        [
          crypto.randomUUID(),
          superbillId,
          charge.cptCode,
          charge.description || null,
          quantity,
          unitCharge,
          totalCharge,
          charge.icdCodes || [],
          LIVE_CODING_SOURCE,
          index + 1,
        ],
      );
    }

    const totalCharges = await pool.query(
      `select coalesce(sum(total_charge), 0) as total, count(*)::int as count
       from superbill_line_items
       where superbill_id = $1`,
      [superbillId],
    );
    const totalDollars = Number(totalCharges.rows[0]?.total || 0);
    const lineCount = Number(totalCharges.rows[0]?.count || 0);

    await pool.query(
      `update superbills
       set total_charges = $1,
           diagnosis_codes = $2,
           primary_diagnosis = $3,
           updated_at = now()
       where id = $4 and tenant_id = $5`,
      [
        totalDollars,
        options.diagnoses.map((diagnosis) => diagnosis.icd10Code),
        options.diagnoses.find((diagnosis) => diagnosis.isPrimary)?.icd10Code || null,
        superbillId,
        options.tenantId,
      ],
    );

    return {
      id: superbillId,
      status: existing.rows[0]?.status || "draft",
      lineCount,
      totalChargesCents: Math.round(totalDollars * 100),
    };
  } catch (error) {
    logger.warn("Live coding could not sync draft superbill", {
      encounterId: options.encounterId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function syncLiveEncounterCoding(options: {
  tenantId: string;
  encounterId: string;
  userId: string;
  noteOverrides?: LiveCodingNoteInput;
}): Promise<LiveCodingSyncResult> {
  const encounter = await loadEncounter(options.tenantId, options.encounterId);
  if (!encounter) {
    throw new Error("Encounter not found");
  }

  const noteInput: LiveCodingNoteInput = {
    chiefComplaint: options.noteOverrides?.chiefComplaint ?? encounter.chiefComplaint,
    hpi: options.noteOverrides?.hpi ?? encounter.hpi,
    ros: options.noteOverrides?.ros ?? encounter.ros,
    exam: options.noteOverrides?.exam ?? encounter.exam,
    assessmentPlan: options.noteOverrides?.assessmentPlan ?? encounter.assessmentPlan,
  };

  const suggestions = suggestLiveCodingFromDocumentation(noteInput);
  const officialCodes = await resolveOfficialDiagnoses(suggestions.diagnosisRules.map((rule) => rule.code));
  let existingDiagnoses = await fetchEncounterDiagnoses(options.tenantId, options.encounterId);
  const hasPrimary = existingDiagnoses.some((diagnosis) => diagnosis.isPrimary);

  let diagnosesCreated = 0;
  const diagnosisSuggestions: LiveCodingDiagnosisSuggestion[] = [];
  for (const [index, rule] of suggestions.diagnosisRules.entries()) {
    const official = officialCodes.get(rule.code.toUpperCase());
    if (!official) {
      suggestions.warnings.push(`ICD-10 code ${rule.code} was suggested but is not in the local ICD-10-CM catalog.`);
      continue;
    }

    const existing = existingDiagnoses.some((diagnosis) => diagnosis.icd10Code.replace(/\./g, "").toUpperCase() === official.code.replace(/\./g, "").toUpperCase());
    const shouldBePrimary = !hasPrimary && index === 0;
    diagnosisSuggestions.push({
      code: official.code,
      description: official.description,
      label: rule.label,
      evidence: rule.evidence,
      isPrimary: shouldBePrimary || existingDiagnoses.some((diagnosis) => diagnosis.icd10Code === official.code && diagnosis.isPrimary),
      existing,
    });

    const result = await upsertDiagnosis(
      options.tenantId,
      options.encounterId,
      official.code,
      official.description,
      shouldBePrimary,
    );
    if (result.created) diagnosesCreated += 1;
  }

  existingDiagnoses = await fetchEncounterDiagnoses(options.tenantId, options.encounterId);
  const linkedDiagnoses = existingDiagnoses.slice(0, 4);
  const linkedDiagnosisIds = linkedDiagnoses.map((diagnosis) => diagnosis.id);
  const icdCodes = linkedDiagnoses.map((diagnosis) => diagnosis.icd10Code);

  let chargesCreated = 0;
  let chargesUpdated = 0;
  const chargeSuggestions: LiveCodingChargeSuggestion[] = [];
  const selectedChargeRules: ProcedureRule[] = [];
  if (suggestions.emCode) {
    selectedChargeRules.push({
      code: suggestions.emCode,
      description: suggestions.emCode === "99214"
        ? "Established patient office/outpatient visit, level 4"
        : "Established patient office/outpatient visit, level 3",
      chargeGroup: "Evaluation & Management",
      reason: suggestions.emCode === "99214"
        ? "Documentation supports a higher-complexity established patient E/M review."
        : "Documentation supports an established patient E/M review.",
      patterns: [],
    });
  }
  selectedChargeRules.push(...suggestions.procedureRules);

  const currentChargesBefore = await fetchEncounterCharges(options.tenantId, options.encounterId);
  for (const rule of selectedChargeRules) {
    const codeInfo = await lookupChargeCode(options.tenantId, rule.code);
    const quantity = rule.quantity || 1;
    const existing = currentChargesBefore.some((charge) => charge.cptCode.toUpperCase() === rule.code.toUpperCase());
    const amountCents = codeInfo.feeCents * quantity;

    chargeSuggestions.push({
      cptCode: codeInfo.code,
      description: codeInfo.description || rule.description,
      codeType: codeInfo.codeType,
      billingRoute: codeInfo.billingRoute,
      feeCents: codeInfo.feeCents,
      amountCents,
      quantity,
      reason: rule.reason,
      existing,
    });

    const upsertResult = await upsertLiveCharge({
      tenantId: options.tenantId,
      encounterId: options.encounterId,
      patientId: encounter.patientId,
      serviceDate: encounter.serviceDate,
      cptCode: codeInfo.code,
      description: codeInfo.description || rule.description,
      codeType: codeInfo.codeType,
      billingRoute: codeInfo.billingRoute,
      quantity,
      feeCents: codeInfo.feeCents,
      linkedDiagnosisIds: codeInfo.billingRoute === "insurance" ? linkedDiagnosisIds : [],
      icdCodes: codeInfo.billingRoute === "insurance" ? icdCodes : [],
      chargeGroup: rule.chargeGroup,
      lineNote: rule.reason,
    });

    if (upsertResult.created) chargesCreated += 1;
    if (upsertResult.updated) chargesUpdated += 1;
  }

  const charges = await fetchEncounterCharges(options.tenantId, options.encounterId);
  const superbill = await syncDraftSuperbill({
    tenantId: options.tenantId,
    encounterId: options.encounterId,
    patientId: encounter.patientId,
    providerId: encounter.providerId,
    serviceDate: encounter.serviceDate,
    userId: options.userId,
    diagnoses: existingDiagnoses,
    charges,
  });

  return {
    diagnoses: existingDiagnoses,
    charges,
    superbill,
    suggestions: {
      diagnoses: diagnosisSuggestions,
      charges: chargeSuggestions,
    },
    applied: {
      diagnosesCreated,
      chargesCreated,
      chargesUpdated,
      superbillLinesSynced: superbill?.lineCount || 0,
    },
    warnings: suggestions.warnings,
  };
}
