import type { MipsEvidence } from '../api/mipsReadiness';

export interface MipsSourceDestination {
  to: string;
  label: string;
  ariaLabel: string;
}

/**
 * Build a source-targeted link without carrying patient or encounter identity
 * in the MIPS record. The destination page performs its normal tenant-scoped
 * authorization before resolving the opaque source identifier.
 */
export function buildMipsSourceDestination(
  item: Pick<MipsEvidence, 'sourceType' | 'sourceId'>,
): MipsSourceDestination | null {
  const sourceId = typeof item.sourceId === 'string' ? item.sourceId.trim() : '';
  if (!sourceId) return null;

  if (item.sourceType === 'biopsy') {
    const query = new URLSearchParams({ search: sourceId }).toString();
    return {
      to: `/biopsies?${query}`,
      label: 'Open biopsy workflow',
      ariaLabel: `Open biopsy workflow for source ${sourceId}`,
    };
  }

  if (item.sourceType === 'chronic_therapy_registry') {
    const query = new URLSearchParams({ tab: 'chronic-therapy', sourceId }).toString();
    return {
      to: `/registry?${query}`,
      label: 'Open chronic therapy registry',
      ariaLabel: `Open chronic therapy registry for source ${sourceId}`,
    };
  }

  return null;
}

export function mipsSourceTraceabilityLimitation(
  item: Pick<MipsEvidence, 'sourceType' | 'sourceId'>,
): string | null {
  if (item.sourceType !== 'itch_assessment') return null;
  const sourceId = typeof item.sourceId === 'string' ? item.sourceId.trim() : '';
  return sourceId
    ? `No safe direct link is available for itch assessments. The authorized clinical view requires patient or encounter context, which is intentionally excluded from MIPS evidence. Open the originating patient encounter and compare opaque source ${sourceId} before reviewing this candidate.`
    : 'No safe direct link is available for itch assessments. The authorized clinical view requires patient or encounter context, which is intentionally excluded from MIPS evidence.';
}

export interface BiopsySearchRecord {
  id?: string | null;
  specimen_id?: string | null;
  patient_name?: string | null;
  mrn?: string | null;
  body_location?: string | null;
  pathology_diagnosis?: string | null;
  path_lab?: string | null;
  loop_status?: string | null;
}

export function biopsyMatchesSearch(biopsy: BiopsySearchRecord, searchTerm: string): boolean {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return true;
  return [
    biopsy.id,
    biopsy.specimen_id,
    biopsy.patient_name,
    biopsy.mrn,
    biopsy.body_location,
    biopsy.pathology_diagnosis,
    biopsy.path_lab,
    biopsy.loop_status,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

export function filterChronicTherapyBySourceId<T extends { id?: unknown }>(
  rows: readonly T[],
  sourceId: string,
): T[] {
  const normalized = sourceId.trim();
  if (!normalized) return [...rows];
  return rows.filter((row) => String(row.id || '') === normalized);
}
