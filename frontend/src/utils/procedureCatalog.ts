export interface ProcedureDescriptor {
  code?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  isCosmetic?: boolean | null;
}

const COSMETIC_CODE_PREFIX = /^(BOTOX|LHR|LASER-|PEEL-|FILLER-|PKG-|CONS-COS|HYDRA|MICRONEED|KYBELLA|IPL-|CO2-)/i;

const COSMETIC_TEXT_MATCHERS = [
  /\bbotox\b/i,
  /\bdysport\b/i,
  /\bxeomin\b/i,
  /botulinum/i,
  /neurotoxin/i,
  /dermal filler/i,
  /\bfiller\b/i,
  /laser hair/i,
  /hair removal/i,
  /chemical peel/i,
  /microneed/i,
  /hydrafacial/i,
  /photofacial/i,
  /\bipl\b/i,
  /fraxel/i,
  /resurfac/i,
  /coolsculpt/i,
  /cooltone/i,
  /body contour/i,
  /kybella/i,
  /cosmetic consult/i,
  /aesthetic/i,
];

export function isCosmeticProcedure(procedure?: ProcedureDescriptor | null): boolean {
  if (!procedure) return false;
  if (procedure.isCosmetic === true) return true;
  if (procedure.isCosmetic === false) return false;

  const code = procedure.code?.trim() ?? '';
  if (COSMETIC_CODE_PREFIX.test(code)) {
    return true;
  }

  const haystack = [
    procedure.description,
    procedure.category,
    procedure.subcategory,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  return COSMETIC_TEXT_MATCHERS.some((matcher) => matcher.test(haystack));
}

export function getCosmeticProcedureGroupLabel(procedure?: ProcedureDescriptor | null): string {
  const fallbackCategory = procedure?.category?.replace(/^Cosmetic\s*-\s*/i, '').trim();
  const haystack = [
    procedure?.code,
    procedure?.description,
    procedure?.category,
    procedure?.subcategory,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (/\bpackage\b/.test(haystack) || /^pkg-/i.test(procedure?.code ?? '')) return 'Packages';
  if (/\bconsult/.test(haystack)) return 'Consultations';
  if (/\bbotox\b|\bdysport\b|\bxeomin\b|botulinum|neurotoxin/.test(haystack)) return 'Neurotoxins';
  if (/\bfiller\b|juvederm|restylane|sculptra|radiesse/.test(haystack)) return 'Dermal Fillers';
  if (/laser hair|hair removal|^lhr-/i.test(haystack)) return 'Laser Hair Removal';
  if (/fraxel|\bipl\b|photofacial|co2|resurfac|laser skin/.test(haystack)) return 'Laser Skin Treatments';
  if (/peel/.test(haystack)) return 'Chemical Peels';
  if (/microneed|radiofrequency|\brf\b/.test(haystack)) return 'Microneedling & RF';
  if (/body contour|coolsculpt|cooltone|kybella/.test(haystack)) return 'Body Contouring';

  return fallbackCategory || 'Other Cosmetic Services';
}
