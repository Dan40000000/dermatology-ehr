import type { AmbientGeneratedNote, PatientSummary } from '../api';

export interface SummaryItem {
  label: string;
  meta?: string;
}

const removeNumbering = (value: string) => value.replace(/^\d+\.\s*/, '').trim();
const TEST_OR_PROCEDURE_PATTERN = /\b(biopsy|pathology|culture|koh|scraping|dermoscopy|photograph|photo|patch test|patch testing|allergy test|lab|cbc|cmp|lipid|pregnancy|hepatic|liver|ferritin|iron|tsh|vitamin d|tb|hepatitis|esr|crp|imaging)\b/i;

const inferSymptomsFromText = (text?: string): string[] => {
  if (!text) return [];
  const symptoms: string[] = [];
  const source = text.toLowerCase();
  const add = (label: string) => {
    if (!symptoms.some((item) => item.toLowerCase() === label.toLowerCase())) {
      symptoms.push(label);
    }
  };
  const hasLesionContext = /\b(mole|lesion|papule|nevus|pigmented)\b/.test(source);
  const hasScalpContext = /\b(scalp|hairline|seborrheic|ketoconazole|shampoo)\b/.test(source);

  if (/\b(changing mole|mole[^.]*changed|changed[^.]*mole|pigmented lesion|dark brown papule|irregular border|multiple shades|asymmetric|suspicious lesion)\b/.test(source)) add('Changing mole / pigmented lesion');
  if (hasLesionContext && /\b(growing|larger|bigger|darker|color change|changed color|multiple shades)\b/.test(source)) add('Growth or color change');
  if (hasLesionContext && /\b(bleed|bleeding|bled|crust|crusted|scab)\b/.test(source)) add('Bleeding / crusting');
  if (hasLesionContext && /\b(catches|catching|clothing|shirt|scratch|scratched|irritated)\b/.test(source)) add('Irritated/catching lesion');
  if (hasScalpContext && /\b(itch|itchy|itching|prurit|scale|scaly|flaky|flaking|shampoo|seborrheic dermatitis|ketoconazole)\b/.test(source)) add('Scalp itching/flaking');
  if (/\b(itch|itchy|itching|prurit)/.test(source) && !hasScalpContext) add('Itching');
  if (/\brash|eruption|dermatitis|eczema/.test(source) && !hasLesionContext && !hasScalpContext) add('Rash / dermatitis');
  if (/\bred|erythema/.test(source)) add('Redness');
  if (/\bpain|tender|sore/.test(source)) add('Pain / tenderness');
  if (/\bbleed|scab|non-healing|won'?t heal/.test(source) && !hasLesionContext) add('Bleeding / non-healing lesion');
  if (/\bacne|breakouts?|pimples?|comedones?/.test(source)) add('Acne / breakouts');
  if (/\b(psoriasis|psoriatic)\b|\b(silvery|thick|well-demarcated)\s+plaques?\b/.test(source)) add('Psoriasis plaques / scaling');

  return symptoms.slice(0, 8);
};

export const stripStructuredNoteContent = (note?: AmbientGeneratedNote | null): AmbientGeneratedNote | null | undefined => {
  if (!note) return note;
  return { ...note, noteContent: undefined };
};

export const splitToList = (text?: string, maxItems = 4): string[] => {
  if (!text) return [];
  const normalized = text.replace(/\s+(\d+\.\s+)/g, '\n$1');
  const parts = normalized
    .split(/[\n;•]+/)
    .map((part) => removeNumbering(part.replace(/^[-*]\s*/, '')).trim())
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
  const structuredSymptoms = coerceSummaryList(note?.noteContent?.formalAppointmentSummary?.symptoms, 8);
  if (structuredSymptoms.length) {
    return structuredSymptoms;
  }

  const summarySymptoms = coerceSummaryList(summary?.symptomsDiscussed, 8);
  if (summarySymptoms.length) {
    return summarySymptoms;
  }

  const inferredSummarySymptoms = inferSymptomsFromText([
    summary?.chiefComplaint,
    summary?.summaryText,
    summary?.diagnosisShared,
    summary?.treatmentPlan,
  ].filter(Boolean).join(' '));
  if (inferredSummarySymptoms.length) {
    return inferredSummarySymptoms;
  }

  const patientConcerns = coerceSummaryList(note?.noteContent?.patientSummary?.yourConcerns);
  if (patientConcerns.length) {
    return patientConcerns;
  }

  const inferredNoteSymptoms = inferSymptomsFromText([
    note?.chiefComplaint,
    note?.hpi,
    note?.ros,
    note?.physicalExam,
    note?.assessment,
    note?.plan,
  ].filter(Boolean).join(' '));
  if (inferredNoteSymptoms.length) {
    return inferredNoteSymptoms;
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
    return note.recommendedTests.filter((test) => TEST_OR_PROCEDURE_PATTERN.test(test.testName)).slice(0, 4).map((test) => ({
      label: test.testName,
      meta: test.urgency ? test.urgency.toUpperCase() : undefined,
    }));
  }

  if (summary?.procedures?.length) {
    return summary.procedures
      .filter((procedure) => {
        const code = procedure.code || '';
        const label = procedure.description || '';
        return !/^99\d{3}$/.test(code) && TEST_OR_PROCEDURE_PATTERN.test(`${code} ${label}`);
      })
      .slice(0, 4)
      .map((procedure) => ({
        label: procedure.description || procedure.code || 'Procedure',
        meta: procedure.code,
      }));
  }

  return [];
};

export const buildTreatmentPlan = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): string[] => {
  const summaryTreatment = splitToList(summary?.treatmentPlan || summary?.followUpInstructions || undefined, 5);
  if (summaryTreatment.length) {
    return summaryTreatment;
  }

  const patientTreatment = splitToList(note?.noteContent?.patientSummary?.treatmentPlan, 5);
  if (patientTreatment.length) {
    return patientTreatment;
  }

  return splitToList(note?.plan, 5);
};

export const buildNextSteps = (
  note?: AmbientGeneratedNote | null,
  summary?: PatientSummary | null
): string[] => {
  const summaryNextSteps = splitToList(summary?.nextSteps || undefined, 5);
  if (summaryNextSteps.length) {
    return summaryNextSteps;
  }

  const noteTasks = note?.followUpTasks
    ?.map((task) => task.dueDate ? `${task.task} (${task.dueDate})` : task.task)
    .filter(Boolean)
    .slice(0, 5) || [];
  if (noteTasks.length) {
    return noteTasks;
  }

  return splitToList(note?.noteContent?.patientSummary?.followUp, 5);
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
