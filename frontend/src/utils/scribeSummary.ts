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

export const buildSymptoms = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): string[] => {
  if (summary?.symptomsDiscussed?.length) {
    return summary.symptomsDiscussed.filter(Boolean);
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
