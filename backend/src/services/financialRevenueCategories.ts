export type RevenueCategoryKey =
  | "office_visit"
  | "procedure"
  | "cosmetic"
  | "late_fee"
  | "no_show_fee"
  | "product_sale"
  | "other";

export interface RevenueCategorySummary {
  key: RevenueCategoryKey;
  label: string;
  revenueCents: number;
  itemCount: number;
}

interface RevenueCategoryInput {
  appointmentTypeName?: string | null;
  notes?: string | null;
  cptCodes?: string | null;
  lineDescriptions?: string | null;
  encounterBacked?: boolean;
}

const CATEGORY_LABELS: Record<RevenueCategoryKey, string> = {
  office_visit: "Dr Appts",
  procedure: "Procedures",
  cosmetic: "Cosmetic",
  late_fee: "Late Fees",
  no_show_fee: "No-Show Fees",
  product_sale: "Product Sales",
  other: "Other",
};

function normalize(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function revenueCategoryLabel(key: RevenueCategoryKey): string {
  return CATEGORY_LABELS[key];
}

export function classifyRevenueCategory(input: RevenueCategoryInput): RevenueCategoryKey {
  const appointmentTypeName = normalize(input.appointmentTypeName);
  const notes = normalize(input.notes);
  const cptCodes = normalize(input.cptCodes);
  const lineDescriptions = normalize(input.lineDescriptions);
  const combined = [appointmentTypeName, notes, cptCodes, lineDescriptions].join(" ");

  if (combined.includes("[no_show_fee]") || cptCodes.includes("noshow")) {
    return "no_show_fee";
  }

  if (combined.includes("[late_fee]") || cptCodes.includes("latefee")) {
    return "late_fee";
  }

  if (
    /(botox|filler|laser|chemical peel|hydrafacial|microderm|microneedling|kybella|prp|ipl|tattoo|cosmetic)/.test(
      combined,
    )
  ) {
    return "cosmetic";
  }

  if (/(biopsy|procedure|removal|excision|mohs|wart|cyst|cryo|treatment)/.test(combined)) {
    return "procedure";
  }

  if (/(product|inventory|retail|sale|kit|cleanser|serum|sunscreen)/.test(combined)) {
    return "product_sale";
  }

  if (
    input.encounterBacked ||
    /(consult|follow-up|follow up|visit|screening|evaluation|check|eczema|rosacea|psoriasis|hair loss|melanoma|nail)/.test(
      combined,
    )
  ) {
    return "office_visit";
  }

  return "other";
}
