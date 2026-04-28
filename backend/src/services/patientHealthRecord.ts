import { pool } from "../db/pool";

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export interface PatientAllergySummary {
  id: string;
  allergen: string;
  allergenName: string;
  name: string;
  allergenType?: string | null;
  reaction: string;
  reactionType?: string | null;
  severity: string;
  status: string;
  source?: string | null;
  verifiedAt?: string | null;
  onsetDate?: string | null;
  notes?: string | null;
}

export interface PatientMedicationSummary {
  id: string;
  medicationName: string;
  name: string;
  strength?: string | null;
  sig: string;
  dosage: string;
  quantity?: string | null;
  refills?: number | null;
  prescribedDate?: string | null;
  providerName?: string | null;
  pharmacyName?: string | null;
}

const NO_KNOWN_VALUES = new Set([
  "none",
  "none known",
  "no known allergies",
  "no known drug allergies",
  "no allergies",
  "nka",
  "nkda",
]);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNoKnownValue(value: string): boolean {
  return NO_KNOWN_VALUES.has(value.trim().toLowerCase());
}

function splitLegacyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanText(item))
      .filter((item) => item.length > 0 && !isNoKnownValue(item));
  }

  const raw = cleanText(value);
  if (!raw || isNoKnownValue(raw)) return [];

  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !isNoKnownValue(item));
}

function parseLegacyAllergy(entry: string, index: number): PatientAllergySummary | null {
  const trimmed = entry.trim();
  if (!trimmed || isNoKnownValue(trimmed)) return null;

  let allergen = trimmed;
  let reaction = "Unknown";

  const parenMatch = trimmed.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (parenMatch?.[1] && parenMatch?.[2]) {
    allergen = parenMatch[1].trim();
    reaction = parenMatch[2].trim();
  } else {
    const separatorMatch = trimmed.match(/^(.+?)\s+(?:-|:|causes)\s+(.+)$/i);
    if (separatorMatch?.[1] && separatorMatch?.[2]) {
      allergen = separatorMatch[1].trim();
      reaction = separatorMatch[2].trim();
    }
  }

  if (!allergen || isNoKnownValue(allergen)) return null;

  const idSafeName = allergen.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    id: `legacy-allergy-${index}-${idSafeName || "unknown"}`,
    allergen,
    allergenName: allergen,
    name: allergen,
    allergenType: null,
    reaction: reaction || "Unknown",
    reactionType: reaction && reaction !== "Unknown" ? reaction : null,
    severity: "unknown",
    status: "active",
    source: "patient_record",
    verifiedAt: null,
    onsetDate: null,
    notes: null,
  };
}

function parseLegacyMedication(entry: string, index: number): PatientMedicationSummary | null {
  const medicationName = entry.trim();
  if (!medicationName) return null;

  const idSafeName = medicationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    id: `legacy-medication-${index}-${idSafeName || "unknown"}`,
    medicationName,
    name: medicationName,
    strength: null,
    sig: "",
    dosage: "",
    quantity: null,
    refills: null,
    prescribedDate: null,
    providerName: null,
    pharmacyName: null,
  };
}

function normalizeAllergyRow(row: any): PatientAllergySummary | null {
  const allergen = cleanText(row.allergen ?? row.allergenName ?? row.name);
  if (!allergen || isNoKnownValue(allergen)) return null;

  const reaction = cleanText(row.reaction ?? row.reactionType) || "Unknown";
  const severity = cleanText(row.severity).toLowerCase() || "unknown";
  const status = cleanText(row.status).toLowerCase() || "active";

  return {
    id: String(row.id ?? `allergy-${allergen.toLowerCase()}`),
    allergen,
    allergenName: allergen,
    name: allergen,
    allergenType: cleanText(row.allergenType) || null,
    reaction,
    reactionType: cleanText(row.reactionType) || (reaction !== "Unknown" ? reaction : null),
    severity,
    status,
    source: cleanText(row.source) || null,
    verifiedAt: row.verifiedAt ?? null,
    onsetDate: row.onsetDate ?? null,
    notes: cleanText(row.notes) || null,
  };
}

function normalizeMedicationRow(row: any): PatientMedicationSummary | null {
  const medicationName = cleanText(row.medicationName ?? row.name);
  if (!medicationName) return null;

  const strength = cleanText(row.strength) || null;
  const sig = cleanText(row.sig);
  const dosage = cleanText(row.dosage) || [strength, sig].filter(Boolean).join(" ");

  return {
    id: String(row.id ?? `medication-${medicationName.toLowerCase()}`),
    medicationName,
    name: medicationName,
    strength,
    sig,
    dosage,
    quantity: cleanText(row.quantity) || null,
    refills: row.refills ?? null,
    prescribedDate: row.prescribedDate ?? row.createdAt ?? null,
    providerName: cleanText(row.providerName) || null,
    pharmacyName: cleanText(row.pharmacyName) || null,
  };
}

async function getLegacyHealthRecord(
  tenantId: string,
  patientId: string,
  db: Queryable,
): Promise<{ allergies: unknown; medications: unknown }> {
  const result = await db.query(
    `SELECT allergies, medications
     FROM patients
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, patientId],
  );

  return {
    allergies: result.rows[0]?.allergies ?? null,
    medications: result.rows[0]?.medications ?? null,
  };
}

export async function getPatientAllergySummaries(
  tenantId: string,
  patientId: string,
  db: Queryable = pool,
  options?: {
    includeStructured?: boolean;
    includeLegacy?: boolean;
    legacyAllergies?: unknown;
  },
): Promise<PatientAllergySummary[]> {
  const includeStructured = options?.includeStructured !== false;
  const includeLegacy = options?.includeLegacy !== false;
  const allergies: PatientAllergySummary[] = [];

  if (includeStructured) {
    try {
      const structured = await db.query(
        `SELECT id,
                allergen,
                allergen_type as "allergenType",
                COALESCE(NULLIF(reaction_type, ''), NULLIF(reaction, '')) as reaction,
                reaction_type as "reactionType",
                severity,
                status,
                source,
                verified_at as "verifiedAt",
                onset_date as "onsetDate",
                notes
         FROM patient_allergies
         WHERE tenant_id = $1
           AND patient_id = $2
           AND COALESCE(status, 'active') = 'active'
         ORDER BY
           CASE LOWER(COALESCE(severity, ''))
             WHEN 'life_threatening' THEN 1
             WHEN 'severe' THEN 2
             WHEN 'moderate' THEN 3
             WHEN 'mild' THEN 4
             ELSE 5
           END,
           allergen`,
        [tenantId, patientId],
      );

      for (const row of structured.rows) {
        const allergy = normalizeAllergyRow(row);
        if (allergy) allergies.push(allergy);
      }
    } catch {
      // Older databases may only have the legacy patient.allergies field.
    }
  }

  if (includeLegacy) {
    let legacyAllergies = options?.legacyAllergies;
    if (legacyAllergies === undefined) {
      try {
        legacyAllergies = (await getLegacyHealthRecord(tenantId, patientId, db)).allergies;
      } catch {
        legacyAllergies = null;
      }
    }

    const legacy = splitLegacyList(legacyAllergies)
      .map((entry, index) => parseLegacyAllergy(entry, index))
      .filter((entry): entry is PatientAllergySummary => entry !== null);

    allergies.push(...legacy);
  }

  const deduped = new Map<string, PatientAllergySummary>();
  for (const allergy of allergies) {
    const key = allergy.allergenName.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, allergy);
    }
  }

  return Array.from(deduped.values());
}

export async function getPatientMedicationSummaries(
  tenantId: string,
  patientId: string,
  db: Queryable = pool,
  options?: {
    includePrescriptions?: boolean;
    includeLegacy?: boolean;
    legacyMedications?: unknown;
  },
): Promise<PatientMedicationSummary[]> {
  const includePrescriptions = options?.includePrescriptions !== false;
  const includeLegacy = options?.includeLegacy !== false;
  const medications: PatientMedicationSummary[] = [];

  if (includePrescriptions) {
    try {
      const prescriptions = await db.query(
        `SELECT id,
                medication_name as "medicationName",
                written_date as "prescribedDate",
                created_at as "createdAt"
         FROM prescriptions
         WHERE tenant_id = $1
           AND patient_id = $2
         ORDER BY COALESCE(written_date::timestamptz, created_at) DESC
         LIMIT 100`,
        [tenantId, patientId],
      );

      for (const row of prescriptions.rows) {
        const medication = normalizeMedicationRow(row);
        if (medication) medications.push(medication);
      }
    } catch {
      // Fall back to the legacy patient.medications summary if prescriptions drift.
    }
  }

  if (includeLegacy) {
    let legacyMedications = options?.legacyMedications;
    if (legacyMedications === undefined) {
      try {
        legacyMedications = (await getLegacyHealthRecord(tenantId, patientId, db)).medications;
      } catch {
        legacyMedications = null;
      }
    }

    const legacy = splitLegacyList(legacyMedications)
      .map((entry, index) => parseLegacyMedication(entry, index))
      .filter((entry): entry is PatientMedicationSummary => entry !== null);

    medications.push(...legacy);
  }

  const deduped = new Map<string, PatientMedicationSummary>();
  for (const medication of medications) {
    const key = medication.medicationName.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, medication);
    }
  }

  return Array.from(deduped.values());
}

export function formatAllergySummary(allergies: PatientAllergySummary[]): string {
  return allergies
    .map((allergy) => {
      if (allergy.reaction && allergy.reaction !== "Unknown") {
        return `${allergy.allergenName} (${allergy.reaction})`;
      }
      return allergy.allergenName;
    })
    .join(", ");
}
