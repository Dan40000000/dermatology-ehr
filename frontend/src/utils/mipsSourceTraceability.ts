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
