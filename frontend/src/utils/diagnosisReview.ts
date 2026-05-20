type DiagnosisLike = {
  description?: string | null;
};

export const AI_DIAGNOSIS_REVIEW_MARKER = '(AI assistant suggested, clinician review required)';

export function isAiSuggestedDiagnosis(diagnosis: DiagnosisLike): boolean {
  return String(diagnosis.description || '').includes(AI_DIAGNOSIS_REVIEW_MARKER);
}

export function cleanAiDiagnosisDescription(description?: string | null): string {
  return String(description || '')
    .replace(AI_DIAGNOSIS_REVIEW_MARKER, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
