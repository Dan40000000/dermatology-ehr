import type { AmbientGeneratedNote, PatientSummary } from '../api';

export interface SummaryItem {
  label: string;
  meta?: string;
}

const removeNumbering = (value: string) => value.replace(/^\d+\.\s*/, '').trim();

export const splitToList = (text?: string, maxItems = 4): string[] => {
  if (!text) return [];
  const parts = text
    .split(/[\n;•]+/)
    .map((part) => part.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(parts));
  return unique.slice(0, maxItems);
};

export const coerceSummaryList = (value: unknown, maxItems = 4): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )).slice(0, maxItems);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return coerceSummaryList(parsed, maxItems);
      }
    } catch {
      // Fall through to delimiter splitting for legacy text values.
    }
    return splitToList(trimmed, maxItems);
  }

  return [];
};

export const buildSymptoms = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): string[] => {
  const structuredSymptoms = coerceSummaryList(note?.noteContent?.formalAppointmentSummary?.symptoms);
  if (structuredSymptoms.length) {
    return structuredSymptoms;
  }

  const summarySymptoms = coerceSummaryList(summary?.symptomsDiscussed);
  if (summarySymptoms.length) {
    return summarySymptoms;
  }

  const patientConcerns = coerceSummaryList(note?.noteContent?.patientSummary?.yourConcerns);
  if (patientConcerns.length) {
    return patientConcerns;
  }
  return splitToList(note?.hpi || note?.chiefComplaint);
};

export const buildConcerns = (note?: AmbientGeneratedNote | null): string[] => {
  return splitToList(note?.chiefComplaint || note?.hpi, 3);
};

export const buildDiagnoses = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): SummaryItem[] => {
  const structuredDiagnoses = note?.noteContent?.formalAppointmentSummary?.probableDiagnoses;
  if (structuredDiagnoses?.length) {
    return structuredDiagnoses.slice(0, 4).map((item) => ({
      label: item.condition,
      meta: Number.isFinite(item.probabilityPercent) ? `${item.probabilityPercent}%` : undefined,
    }));
  }

  if (note?.differentialDiagnoses?.length) {
    return note.differentialDiagnoses.slice(0, 4).map((item) => ({
      label: item.condition,
      meta: item.confidence ? `${Math.round(item.confidence * 100)}%` : undefined,
    }));
  }

  if (summary?.diagnosisShared) {
    return [{ label: summary.diagnosisShared }];
  }

  if (note?.assessment) {
    const firstLine = removeNumbering(note.assessment.split('\n')[0] || '');
    if (firstLine) {
      return [{ label: firstLine }];
    }
  }

  return [];
};

export const buildTests = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): SummaryItem[] => {
  const structuredTests = note?.noteContent?.formalAppointmentSummary?.suggestedTests;
  if (structuredTests?.length) {
    return structuredTests.slice(0, 4).map((test) => ({
      label: test.testName,
      meta: test.urgency ? test.urgency.toUpperCase() : undefined,
    }));
  }

  if (note?.recommendedTests?.length) {
    return note.recommendedTests.slice(0, 4).map((test) => ({
      label: test.testName,
      meta: test.urgency ? test.urgency.toUpperCase() : undefined,
    }));
  }

  if (summary?.nextSteps) {
    return splitToList(summary.nextSteps, 4).map((label) => ({ label }));
  }

  return [];
};

export const buildSummaryText = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): string => {
  if (summary?.summaryText) {
    return summary.summaryText;
  }

  const patientSummaryText = note?.noteContent?.patientSummary?.whatWeDiscussed;
  if (patientSummaryText) {
    return patientSummaryText;
  }

  const sections: string[] = [];
  if (note?.chiefComplaint) {
    sections.push(`Concerns: ${note.chiefComplaint}`);
  }
  if (note?.assessment) {
    sections.push(`Assessment: ${note.assessment}`);
  }
  if (note?.plan) {
    sections.push(`Plan: ${note.plan}`);
  }

  return sections.join('\n\n');
};
