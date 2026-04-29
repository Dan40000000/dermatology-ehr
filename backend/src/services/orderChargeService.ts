import crypto from "crypto";
import { pool } from "../db/pool";
import { logger } from "../lib/logger";

export interface OrderChargeInput {
  tenantId: string;
  orderId: string;
  encounterId?: string;
  patientId?: string;
  type: string;
  details?: string;
  notes?: string;
  billable?: boolean;
  cptCode?: string;
  icdCodes?: string[];
  quantity?: number;
  feeCents?: number;
  amountCents?: number;
}

export interface OrderChargeResult {
  chargeId: string;
  cptCode: string;
  description: string;
  quantity: number;
  feeCents: number;
  amountCents: number;
  status: "ready";
}

interface ChargeRule {
  cptCode: string;
  description: string;
  defaultFeeCents: number;
  patterns: RegExp[];
}

const ORDER_CHARGE_RULES: ChargeRule[] = [
  {
    cptCode: "11104",
    description: "Punch biopsy, first lesion",
    defaultFeeCents: 19500,
    patterns: [/punch\s+biopsy/i],
  },
  {
    cptCode: "11102",
    description: "Tangential skin biopsy, single lesion",
    defaultFeeCents: 17500,
    patterns: [/\bbiopsy\b/i, /\bshave\s+bx\b/i, /\bbx\b/i],
  },
  {
    cptCode: "11600",
    description: "Excision malignant lesion, 0.5 cm or less",
    defaultFeeCents: 35000,
    patterns: [/\bmalignant\s+excision\b/i, /\bmelanoma\s+excision\b/i, /\bbcc\s+excision\b/i, /\bscc\s+excision\b/i],
  },
  {
    cptCode: "11400",
    description: "Excision benign lesion, 0.5 cm or less",
    defaultFeeCents: 22500,
    patterns: [/\bexcision\b/i, /\bcyst\s+removal\b/i, /\blesion\s+removal\b/i],
  },
  {
    cptCode: "17110",
    description: "Destruction of benign lesions, up to 14",
    defaultFeeCents: 20000,
    patterns: [/\bwart\b/i, /\bskin\s+tag\b/i, /\bseborrheic\b/i, /\bbenign\s+destruction\b/i],
  },
  {
    cptCode: "17000",
    description: "Destruction premalignant lesion, first lesion",
    defaultFeeCents: 17500,
    patterns: [/\bcryo(?:therapy)?\b/i, /\bactinic\b/i, /\bAK\b/i, /\bpremalignant\b/i, /\bdestruction\b/i],
  },
  {
    cptCode: "11900",
    description: "Intralesional injection, up to 7 lesions",
    defaultFeeCents: 15000,
    patterns: [/\bintralesional\b/i, /\bkenalog\b/i, /\bkeloid\s+injection\b/i, /\bcyst\s+injection\b/i],
  },
  {
    cptCode: "12001",
    description: "Simple repair, 2.5 cm or less",
    defaultFeeCents: 17500,
    patterns: [/\brepair\b/i, /\bsuture\b/i, /\bclosure\b/i],
  },
  {
    cptCode: "96910",
    description: "Phototherapy",
    defaultFeeCents: 12500,
    patterns: [/\bphototherapy\b/i, /\bPUVA\b/i, /\bUVB\b/i],
  },
  {
    cptCode: "95044",
    description: "Patch test, each allergen",
    defaultFeeCents: 1500,
    patterns: [/\bpatch\s+test\b/i, /\ballergy\s+test\b/i],
  },
  {
    cptCode: "88305",
    description: "Surgical pathology, Level IV",
    defaultFeeCents: 12500,
    patterns: [/\bpathology\b/i, /\bdermpath\b/i],
  },
];

function normalizeCptCode(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function detectBillableProcedure(input: OrderChargeInput): ChargeRule | null {
  const explicitCode = normalizeCptCode(input.cptCode);
  if (explicitCode) {
    return {
      cptCode: explicitCode,
      description: "Billable order",
      defaultFeeCents: 0,
      patterns: [],
    };
  }

  const haystack = [input.type, input.details, input.notes].filter(Boolean).join(" ");
  return ORDER_CHARGE_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(haystack))) || null;
}

async function lookupFee(tenantId: string, cptCode: string): Promise<{ feeCents: number; description?: string }> {
  const feeScheduleResult = await pool.query(
    `select fsi.fee_cents as "feeCents", fsi.cpt_description as "description"
       from fee_schedule_items fsi
       join fee_schedules fs on fs.id = fsi.fee_schedule_id
      where fs.tenant_id = $1
        and upper(fsi.cpt_code) = upper($2)
      order by fs.is_default desc, fsi.created_at desc
      limit 1`,
    [tenantId, cptCode],
  );

  if (feeScheduleResult.rows[0]) {
    return {
      feeCents: Number(feeScheduleResult.rows[0].feeCents || 0),
      description: feeScheduleResult.rows[0].description || undefined,
    };
  }

  const cptResult = await pool.query(
    `select default_fee_cents as "feeCents", description
       from cpt_codes
      where upper(code) = upper($1)
      limit 1`,
    [cptCode],
  );

  return {
    feeCents: Number(cptResult.rows[0]?.feeCents || 0),
    description: cptResult.rows[0]?.description || undefined,
  };
}

export async function createChargeForOrder(input: OrderChargeInput): Promise<OrderChargeResult | null> {
  if (input.billable === false || !input.encounterId) {
    return null;
  }

  const rule = detectBillableProcedure(input);
  if (!rule && input.billable !== true) {
    return null;
  }

  const cptCode = normalizeCptCode(input.cptCode) || rule?.cptCode;
  if (!cptCode) {
    return null;
  }

  const encounterResult = await pool.query(
    `select e.patient_id as "patientId",
            coalesce(a.scheduled_start::date, e.created_at::date, current_date) as "serviceDate"
     from encounters e
     left join appointments a on a.id = e.appointment_id and a.tenant_id = e.tenant_id
     where e.id = $1 and e.tenant_id = $2
     limit 1`,
    [input.encounterId, input.tenantId],
  );
  const encounterPatientId = encounterResult.rows[0]?.patientId as string | undefined;
  const serviceDate = encounterResult.rows[0]?.serviceDate || new Date().toISOString().slice(0, 10);

  const existingCharge = await pool.query(
    `select id, cpt_code as "cptCode", description, quantity, fee_cents as "feeCents",
            amount_cents as "amountCents", status
       from charges
      where tenant_id = $1
        and encounter_id = $2
        and description ilike $3
      limit 1`,
    [input.tenantId, input.encounterId, `%Order ${input.orderId}%`],
  );

  if (existingCharge.rows[0]) {
    const row = existingCharge.rows[0];
    return {
      chargeId: row.id,
      cptCode: row.cptCode,
      description: row.description,
      quantity: row.quantity || 1,
      feeCents: row.feeCents || 0,
      amountCents: row.amountCents || row.feeCents || 0,
      status: "ready",
    };
  }

  const fee = await lookupFee(input.tenantId, cptCode);
  const quantity = input.quantity || 1;
  const feeCents = input.feeCents ?? (fee.feeCents || rule?.defaultFeeCents || 0);
  const amountCents = input.amountCents ?? feeCents * quantity;
  const descriptionBase = fee.description || rule?.description || "Billable order";
  const orderDetails = input.details ? `: ${input.details}` : "";
  const description = `${descriptionBase}${orderDetails} (Order ${input.orderId})`;
  const chargeId = crypto.randomUUID();

  await pool.query(
    `insert into charges(
       id, tenant_id, encounter_id, cpt_code, description, icd_codes,
       linked_diagnosis_ids, quantity, fee_cents, amount_cents, status
       , patient_id, service_date, amount
     )
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::int,$11,$12,$13,round(($10::numeric / 100), 2))`,
    [
      chargeId,
      input.tenantId,
      input.encounterId,
      cptCode,
      description,
      input.icdCodes || [],
      [],
      quantity,
      feeCents,
      amountCents,
      "ready",
      input.patientId || encounterPatientId || null,
      serviceDate,
    ],
  );

  logger.info("Created charge from billable order", {
    tenantId: input.tenantId,
    orderId: input.orderId,
    encounterId: input.encounterId,
    chargeId,
    cptCode,
    amountCents,
  });

  return {
    chargeId,
    cptCode,
    description,
    quantity,
    feeCents,
    amountCents,
    status: "ready",
  };
}
