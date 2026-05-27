import { logger } from '../lib/logger';
import { getEnabledOpenAiApiKey } from '../utils/externalAiGate';
import { redactValue } from '../utils/phiRedaction';
import {
  generateAmbientLiveInsights,
  type AmbientLiveInsights,
  type LiveClinicalActionInsight,
  type LiveDiagnosisInsight,
  type LiveMedicationInsight,
  type LiveSafetyFlagInsight,
  type LiveSuggestedTestInsight,
  type LiveSymptomInsight,
  type LiveVisitSummaryInsight,
} from './ambientLiveInsights';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

type GenerateLiveInsightsOptions = {
  fallback?: AmbientLiveInsights;
};

function getOpenAIKey(): string | undefined {
  return getEnabledOpenAiApiKey();
}

function getLiveInsightsModel(): string {
  return (
    process.env.OPENAI_LIVE_INSIGHTS_MODEL ||
    process.env.OPENAI_COPILOT_MODEL ||
    process.env.OPENAI_NOTE_MODEL ||
    'gpt-4o-mini'
  );
}

function getMinTranscriptChars(): number {
  const parsed = Number(process.env.AMBIENT_LIVE_AI_MIN_CHARS || 180);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
}

const LIVE_AI_IDENTIFIER_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b((?:my name is|i am|i'm|this is|patient(?: name)?(?: is)?|name:)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/gi,
    replacement: '$1[NAME-REDACTED]',
  },
  {
    pattern: /\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g,
    replacement: '[NAME-REDACTED]',
  },
  {
    pattern: /\b\d{1,6}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,4}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi,
    replacement: '[ADDRESS-REDACTED]',
  },
];

function sanitizeLiveAIText(value: string): string {
  let sanitized = redactValue(value);
  if (typeof sanitized !== 'string') {
    return '';
  }

  for (const { pattern, replacement } of LIVE_AI_IDENTIFIER_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

function sanitizeLiveAIValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeLiveAIText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLiveAIValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeLiveAIValue(nestedValue);
    }
    return sanitized as T;
  }

  return value;
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactValue(error.message);
  }
  if (typeof error === 'string') {
    return redactValue(error);
  }
  return 'Unknown error';
}

function normalizeTranscript(input: string | string[]): string {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return input.trim();
}

function clampConfidence(value: unknown, fallback = 0.55): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed > 1) {
    return Math.max(0, Math.min(1, parsed / 100));
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeVisitSummary(
  value: unknown,
  fallback: LiveVisitSummaryInsight
): LiveVisitSummaryInsight {
  const parsed = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    oneLiner: normalizeString(parsed.oneLiner, fallback.oneLiner || 'Live visit summary not available yet.'),
    patientReported: normalizeStringArray(parsed.patientReported, 5),
    providerObserved: normalizeStringArray(parsed.providerObserved, 5),
    planDraft: normalizeStringArray(parsed.planDraft, 6),
    documentationGaps: normalizeStringArray(parsed.documentationGaps, 6),
  };
}

function normalizeSymptoms(value: unknown, fallback: LiveSymptomInsight[]): LiveSymptomInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveSymptomInsight[] = [];
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = normalizeString(parsed.label);
    if (!label) continue;
    normalized.push({
      label,
      confidence: clampConfidence(parsed.confidence, 0.58),
      evidence: normalizeString(parsed.evidence) || undefined,
    });
    if (normalized.length >= 8) break;
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeDiagnoses(value: unknown, fallback: LiveDiagnosisInsight[]): LiveDiagnosisInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveDiagnosisInsight[] = [];
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const condition = normalizeString(parsed.condition);
    if (!condition) continue;
    normalized.push({
      condition,
      confidence: clampConfidence(parsed.confidence, 0.52),
      reasoning: normalizeString(parsed.reasoning, 'Grounded in the live visit transcript.'),
      icd10Code: normalizeString(parsed.icd10Code) || undefined,
    });
    if (normalized.length >= 5) break;
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeSuggestedTests(
  value: unknown,
  fallback: LiveSuggestedTestInsight[],
  transcript = ''
): LiveSuggestedTestInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveSuggestedTestInsight[] = [];
  const normalizedTranscript = transcript.toLowerCase();
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    let testName = normalizeString(parsed.testName);
    if (!testName) continue;
    if (
      /\b(shave|tangential|biopsy|pathology|histopathology)\b/.test(normalizedTranscript)
      && /\b(histopathology|pathology review|skin biopsy|biopsy)\b/i.test(testName)
    ) {
      testName = /\b(shave|tangential)\b/.test(normalizedTranscript)
        ? 'Shave/tangential biopsy with dermatopathology'
        : 'Skin biopsy with dermatopathology';
    }
    if (/\b(cryotherapy|liquid nitrogen|LN2|wound care|sunscreen|sun protection|medication|prescription)\b/i.test(testName)) {
      continue;
    }
    const urgency = normalizeString(parsed.urgency).toLowerCase();
    normalized.push({
      testName,
      urgency: urgency === 'urgent' || urgency === 'soon' ? urgency : 'routine',
      rationale: normalizeString(parsed.rationale, 'Suggested for clinician review from the live transcript.'),
      cptCode: (
        normalizeString(parsed.cptCode) === '11100'
          || (/\b(shave|tangential)\b/.test(normalizedTranscript) && /\bbiopsy\b/i.test(testName))
      )
        ? '11102'
        : normalizeString(parsed.cptCode) || undefined,
    });
    if (normalized.length >= 6) break;
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeMedications(
  value: unknown,
  fallback: LiveMedicationInsight[]
): LiveMedicationInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveMedicationInsight[] = [];
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const name = normalizeString(parsed.name);
    if (!name) continue;
    const context = normalizeString(parsed.context).toLowerCase();
    normalized.push({
      name,
      confidence: clampConfidence(parsed.confidence, 0.72),
      context: context === 'current' || context === 'recommended' ? context : 'discussed',
      evidence: normalizeString(parsed.evidence) || undefined,
    });
    if (normalized.length >= 6) break;
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeClinicalActions(
  value: unknown,
  fallback: LiveClinicalActionInsight[]
): LiveClinicalActionInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveClinicalActionInsight[] = [];
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = normalizeString(parsed.label);
    if (!label) continue;
    const type = normalizeString(parsed.type).toLowerCase();
    const urgency = normalizeString(parsed.urgency).toLowerCase();
    const status = normalizeString(parsed.status).toLowerCase();
    normalized.push({
      label,
      type: type === 'medication' || type === 'procedure' || type === 'lab' || type === 'follow_up' || type === 'education'
        ? type
        : 'documentation',
      urgency: urgency === 'urgent' || urgency === 'soon' ? urgency : 'routine',
      status: status === 'planned' || status === 'mentioned' ? status : 'consider',
      rationale: normalizeString(parsed.rationale, 'Action suggested from the live transcript.'),
      evidence: normalizeString(parsed.evidence) || undefined,
    });
    if (normalized.length >= 8) break;
  }

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeSafetyFlags(
  value: unknown,
  fallback: LiveSafetyFlagInsight[]
): LiveSafetyFlagInsight[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized: LiveSafetyFlagInsight[] = [];
  for (const item of value) {
    const parsed = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = normalizeString(parsed.label);
    if (!label) continue;
    const severity = normalizeString(parsed.severity).toLowerCase();
    normalized.push({
      label,
      severity: severity === 'urgent' || severity === 'soon' ? severity : 'watch',
      rationale: normalizeString(parsed.rationale, 'Needs clinician review based on live transcript content.'),
      evidence: normalizeString(parsed.evidence) || undefined,
    });
    if (normalized.length >= 5) break;
  }

  return normalized;
}

function buildSystemPrompt(): string {
  return [
    'You are a live dermatology ambient scribe assistant.',
    'You are analyzing a partial clinical conversation while the visit is still in progress.',
    'Return a strict JSON object only.',
    'Ground every summary point in the transcript. Do not invent findings.',
    'Treat diagnoses as potential diagnoses only, not confirmed diagnoses.',
    'Use confidence values from 0 to 1, where 0.75 means 75%.',
    'Only list active symptoms or concerns. Do not list denied symptoms or aftercare warning signs as current symptoms.',
    'Separate diagnostic tests from treatments. Cryotherapy, wound care, sunscreen, and medications are treatments/instructions, not tests.',
    'For a rough or gritty scaly lesion on a sun-exposed cheek/face treated with liquid nitrogen, include actinic keratosis with ICD-10 L57.0 when supported.',
    'For a darker/changing/irregular pigmented mole being biopsied, include D48.5 as melanoma rule-out or neoplasm of uncertain behavior until pathology returns.',
    'If shave or tangential biopsy is discussed, suggest "Shave/tangential biopsy with dermatopathology" with CPT 11102 instead of generic histopathology or retired CPT 11100.',
    'Only recommend tests if the transcript supports them.',
    'Keep language concise, clinical, and useful for a dermatologist reviewing the visit live.',
  ].join(' ');
}

function buildUserPrompt(transcript: string, heuristic: AmbientLiveInsights): string {
  return [
    'Summarize the live visit in the JSON shape below.',
    'Return only JSON.',
    '{',
    '  "visitSummary": {',
    '    "oneLiner": string,',
    '    "patientReported": string[],',
    '    "providerObserved": string[],',
    '    "planDraft": string[],',
    '    "documentationGaps": string[]',
    '  },',
    '  "symptoms": [{"label": string, "confidence": number, "evidence": string}],',
    '  "workingDiagnoses": [{"condition": string, "confidence": number, "reasoning": string, "icd10Code": string}],',
    '  "suggestedTests": [{"testName": string, "urgency": "routine|soon|urgent", "rationale": string, "cptCode": string}],',
    '  "medications": [{"name": string, "confidence": number, "context": "current|recommended|discussed", "evidence": string}],',
    '  "clinicalActions": [{"label": string, "type": "medication|procedure|lab|follow_up|education|documentation", "urgency": "routine|soon|urgent", "status": "mentioned|consider|planned", "rationale": string, "evidence": string}],',
    '  "safetyFlags": [{"label": string, "severity": "watch|soon|urgent", "rationale": string, "evidence": string}]',
    '}',
    '',
    'Use the heuristic baseline only as a starting point. Improve it when the transcript supports a better summary.',
    'If the transcript says no bleeding, no rapid growth, no drainage, no fever, or similar negatives, do not put those in symptoms.',
    'If the transcript includes cryotherapy/liquid nitrogen, put it under clinicalActions as a procedure/treatment, not suggestedTests.',
    'If pathology is being ordered after a shave biopsy, the suggested test should include the biopsy/pathology workflow, not only "Histopathology".',
    'Do not alter billingCodes; those are generated deterministically by coding rules and require billing-team review.',
    '',
    'HEURISTIC BASELINE:',
    JSON.stringify(heuristic, null, 2),
    '',
    'LIVE TRANSCRIPT:',
    transcript,
  ].join('\n');
}

function mergeInsights(
  fallback: AmbientLiveInsights,
  parsed: Record<string, unknown>,
  transcript = ''
): AmbientLiveInsights {
  return {
    source: 'openai',
    updatedAt: new Date().toISOString(),
    visitSummary: normalizeVisitSummary(parsed.visitSummary, fallback.visitSummary),
    symptoms: normalizeSymptoms(parsed.symptoms, fallback.symptoms),
    workingDiagnoses: normalizeDiagnoses(parsed.workingDiagnoses, fallback.workingDiagnoses),
    suggestedTests: normalizeSuggestedTests(parsed.suggestedTests, fallback.suggestedTests, transcript),
    medications: normalizeMedications(parsed.medications, fallback.medications),
    clinicalActions: normalizeClinicalActions(parsed.clinicalActions, fallback.clinicalActions),
    safetyFlags: normalizeSafetyFlags(parsed.safetyFlags, fallback.safetyFlags),
    billingCodes: fallback.billingCodes,
  };
}

export async function generateAmbientLiveInsightsWithAI(
  input: string | string[],
  options?: GenerateLiveInsightsOptions
): Promise<AmbientLiveInsights> {
  const transcript = normalizeTranscript(input);
  const fallback = options?.fallback || generateAmbientLiveInsights(transcript);
  const apiKey = getOpenAIKey();

  if (!apiKey || transcript.length < getMinTranscriptChars()) {
    return fallback;
  }

  const sanitizedTranscript = sanitizeLiveAIText(transcript);
  const sanitizedFallback = sanitizeLiveAIValue(fallback);

  try {
    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getLiveInsightsModel(),
        temperature: 0.1,
        max_tokens: 1400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(sanitizedTranscript, sanitizedFallback) },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn('OpenAI live insights request failed, falling back to heuristic', {
        error: redactValue(`OpenAI live insights error: ${response.status} ${errorText}`),
      });
      return fallback;
    }

    const payload = await response.json() as any;
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      logger.warn('OpenAI live insights returned an empty response, falling back to heuristic');
      return fallback;
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    return mergeInsights(fallback, parsed, sanitizedTranscript);
  } catch (error) {
    logger.warn('OpenAI live insights generation failed, falling back to heuristic', {
      error: toSafeErrorMessage(error),
    });
    return fallback;
  }
}
