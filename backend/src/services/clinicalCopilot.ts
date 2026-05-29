import { logger } from '../lib/logger';
import {
  AiPhiBlockError,
  assertClinicalAiPromptIsSafeForExternalAi,
  deidentifyTextForExternalAi,
  isHipaaClinicalAiEnabled,
} from '../utils/aiPhiGuard';
import { getEnabledAnthropicApiKey, getEnabledOpenAiApiKey } from '../utils/externalAiGate';
import { meteredOpenAiFetch } from '../utils/openAiSpendGuard';
import { redactValue } from '../utils/phiRedaction';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

export interface ClinicalCopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClinicalCopilotCodeSuggestion {
  type: 'em' | 'cpt' | 'icd10';
  code: string;
  description: string;
  confidence: number;
  rationale: string;
}

export interface ClinicalCopilotContext {
  patientId?: string;
  encounterId?: string;
  noteId?: string;
  recordingId?: string;
  patientAge?: number;
  appointmentTypeName?: string;
  appointmentTypeCategory?: string;
  specialtyFocus?: string;
  encounter?: {
    chiefComplaint?: string;
    hpi?: string;
    ros?: string;
    exam?: string;
    assessmentPlan?: string;
  };
  note?: {
    chiefComplaint?: string;
    hpi?: string;
    ros?: string;
    physicalExam?: string;
    assessment?: string;
    plan?: string;
    suggestedIcd10Codes?: Array<{ code: string; description: string; confidence?: number }>;
    suggestedCptCodes?: Array<{ code: string; description: string; confidence?: number }>;
    followUpTasks?: Array<{ task: string; priority?: string; dueDate?: string; confidence?: number }>;
    recommendedTests?: Array<{ testName: string; rationale?: string; urgency?: 'routine' | 'soon' | 'urgent'; cptCode?: string }>;
    patientSummary?: {
      whatWeDiscussed?: string;
      yourConcerns?: string[];
      diagnosis?: string;
      treatmentPlan?: string;
      followUp?: string;
    };
  };
  transcriptExcerpt?: string;
}

export interface ClinicalCopilotResult {
  answer: string;
  visitSummary: string;
  suggestedCodes: ClinicalCopilotCodeSuggestion[];
  followUpTasks: string[];
  patientInstructions: string[];
  missingData: string[];
  chartEvidence: string[];
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
}

interface AskClinicalCopilotInput {
  question: string;
  history?: ClinicalCopilotMessage[];
  context: ClinicalCopilotContext;
  tenantId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
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

function clampText(value: unknown, max = 3000): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function sanitizeExternalAiText(value: unknown, max = 3000): string | undefined {
  const redacted = redactValue(value);
  const deidentified = typeof redacted === 'string'
    ? deidentifyTextForExternalAi(redacted).text
    : redacted;
  return clampText(deidentified, max);
}

function dedupeStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function sanitizeContext(context: ClinicalCopilotContext): ClinicalCopilotContext {
  return {
    patientId: context.patientId,
    encounterId: context.encounterId,
    noteId: context.noteId,
    recordingId: context.recordingId,
    patientAge: context.patientAge,
    appointmentTypeName: clampText(context.appointmentTypeName, 120),
    appointmentTypeCategory: clampText(context.appointmentTypeCategory, 80),
    specialtyFocus: clampText(context.specialtyFocus, 80),
    encounter: context.encounter
      ? {
          chiefComplaint: sanitizeExternalAiText(context.encounter.chiefComplaint, 800),
          hpi: sanitizeExternalAiText(context.encounter.hpi, 2200),
          ros: sanitizeExternalAiText(context.encounter.ros, 1400),
          exam: sanitizeExternalAiText(context.encounter.exam, 1800),
          assessmentPlan: sanitizeExternalAiText(context.encounter.assessmentPlan, 2200),
        }
      : undefined,
    note: context.note
      ? {
          chiefComplaint: sanitizeExternalAiText(context.note.chiefComplaint, 800),
          hpi: sanitizeExternalAiText(context.note.hpi, 2200),
          ros: sanitizeExternalAiText(context.note.ros, 1400),
          physicalExam: sanitizeExternalAiText(context.note.physicalExam, 1800),
          assessment: sanitizeExternalAiText(context.note.assessment, 1800),
          plan: sanitizeExternalAiText(context.note.plan, 2200),
          suggestedIcd10Codes: Array.isArray(context.note.suggestedIcd10Codes)
            ? context.note.suggestedIcd10Codes.slice(0, 6)
            : [],
          suggestedCptCodes: Array.isArray(context.note.suggestedCptCodes)
            ? context.note.suggestedCptCodes.slice(0, 6)
            : [],
          followUpTasks: Array.isArray(context.note.followUpTasks)
            ? context.note.followUpTasks.slice(0, 6).map((task) => ({
                task: sanitizeExternalAiText(task.task, 240) || 'Follow-up task',
                priority: clampText(task.priority, 40),
                dueDate: clampText(task.dueDate, 40),
                confidence: task.confidence,
              }))
            : [],
          recommendedTests: Array.isArray(context.note.recommendedTests)
            ? context.note.recommendedTests.slice(0, 6).map((test) => ({
                testName: sanitizeExternalAiText(test.testName, 200) || 'Recommended test',
                rationale: sanitizeExternalAiText(test.rationale, 240),
                urgency: test.urgency,
                cptCode: clampText(test.cptCode, 32),
              }))
            : [],
          patientSummary: context.note.patientSummary
            ? {
                whatWeDiscussed: sanitizeExternalAiText(context.note.patientSummary.whatWeDiscussed, 600),
                yourConcerns: Array.isArray(context.note.patientSummary.yourConcerns)
                  ? context.note.patientSummary.yourConcerns
                      .map((item) => sanitizeExternalAiText(item, 180))
                      .filter((item): item is string => Boolean(item))
                      .slice(0, 8)
                  : [],
                diagnosis: sanitizeExternalAiText(context.note.patientSummary.diagnosis, 300),
                treatmentPlan: sanitizeExternalAiText(context.note.patientSummary.treatmentPlan, 500),
                followUp: sanitizeExternalAiText(context.note.patientSummary.followUp, 220),
              }
            : undefined,
        }
      : undefined,
    transcriptExcerpt: sanitizeExternalAiText(context.transcriptExcerpt, 5000),
  };
}

function buildContextBlock(context: ClinicalCopilotContext): string {
  const safe = sanitizeContext(context);
  return JSON.stringify(safe, null, 2);
}

function normalizeHistory(history?: ClinicalCopilotMessage[]): ClinicalCopilotMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content.length > 0)
    .slice(-8);
}

function sanitizeOutboundQuestion(question: string): string {
  if (isHipaaClinicalAiEnabled()) {
    return question.trim();
  }
  return deidentifyTextForExternalAi(question).text.trim();
}

function sanitizeOutboundHistory(history?: ClinicalCopilotMessage[]): ClinicalCopilotMessage[] {
  const normalized = normalizeHistory(history);
  if (isHipaaClinicalAiEnabled()) {
    return normalized;
  }
  return normalized.map((message) => ({
    ...message,
    content: deidentifyTextForExternalAi(message.content).text,
  }));
}

function buildSystemPrompt(): string {
  return [
    'You are Dermatology Clinical Copilot, an in-chart assistant for dermatology clinicians.',
    'Your job is to summarize encounters, suggest documentation improvements, suggest ICD-10/CPT/E/M codes, and answer chart questions.',
    'You must stay grounded in the supplied chart context only. If the chart does not support a conclusion, say that clearly.',
    'Do not present autonomous diagnosis. Frame uncertain conclusions as clinician review items.',
    'When asked about office visit coding, explain the reasoning using documented complexity, prescription management, chronicity, tests, and missing documentation.',
    'Keep answers concise, clinically useful, and operationally specific.',
    'Return strict JSON only.',
  ].join(' ');
}

function buildUserPrompt(question: string, context: ClinicalCopilotContext): string {
  return [
    'Use the chart context below to answer the clinician question.',
    'If you suggest a code, explain why and mention the strongest alternative when relevant.',
    'If documentation is incomplete, call that out in missingData instead of guessing.',
    'Return JSON with this shape:',
    '{',
    '  "answer": string,',
    '  "visitSummary": string,',
    '  "suggestedCodes": [{"type":"em|cpt|icd10","code":string,"description":string,"confidence":number,"rationale":string}],',
    '  "followUpTasks": string[],',
    '  "patientInstructions": string[],',
    '  "missingData": string[],',
    '  "chartEvidence": string[]',
    '}',
    '',
    'CHART CONTEXT:',
    buildContextBlock(context),
    '',
    `CLINICIAN QUESTION: ${sanitizeOutboundQuestion(question)}`,
  ].join('\n');
}

function parseJsonPayload(raw: string): Omit<ClinicalCopilotResult, 'provider' | 'model'> {
  const parsed = JSON.parse(raw);
  return {
    answer: typeof parsed.answer === 'string' ? parsed.answer.trim() : 'No answer returned.',
    visitSummary: typeof parsed.visitSummary === 'string' ? parsed.visitSummary.trim() : 'Summary not available.',
    suggestedCodes: Array.isArray(parsed.suggestedCodes)
      ? parsed.suggestedCodes
          .map((item: any) => ({
            type: item?.type === 'icd10' || item?.type === 'cpt' ? item.type : 'em',
            code: typeof item?.code === 'string' ? item.code.trim() : '',
            description: typeof item?.description === 'string' ? item.description.trim() : '',
            confidence: typeof item?.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.6,
            rationale: typeof item?.rationale === 'string' ? item.rationale.trim() : '',
          }))
          .filter((item: ClinicalCopilotCodeSuggestion) => Boolean(item.code && item.description))
          .slice(0, 8)
      : [],
    followUpTasks: Array.isArray(parsed.followUpTasks)
      ? parsed.followUpTasks.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim()).slice(0, 8)
      : [],
    patientInstructions: Array.isArray(parsed.patientInstructions)
      ? parsed.patientInstructions.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim()).slice(0, 8)
      : [],
    missingData: Array.isArray(parsed.missingData)
      ? parsed.missingData.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim()).slice(0, 8)
      : [],
    chartEvidence: Array.isArray(parsed.chartEvidence)
      ? parsed.chartEvidence.filter((item: unknown) => typeof item === 'string' && item.trim()).map((item: string) => item.trim()).slice(0, 8)
      : [],
  };
}

function getOpenAIKey(): string | undefined {
  return getEnabledOpenAiApiKey();
}

function getAnthropicKey(): string | undefined {
  return getEnabledAnthropicApiKey();
}

function getOpenAIModel(): string {
  return process.env.OPENAI_COPILOT_MODEL || process.env.OPENAI_NOTE_MODEL || 'gpt-4o-mini';
}

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_COPILOT_MODEL || process.env.ANTHROPIC_NOTE_MODEL || 'claude-3-5-sonnet-20241022';
}

async function askOpenAI(input: AskClinicalCopilotInput): Promise<ClinicalCopilotResult> {
  const apiKey = getOpenAIKey();
  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }

  const model = getOpenAIModel();
  const history = sanitizeOutboundHistory(input.history).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await meteredOpenAiFetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...history,
        { role: 'user', content: buildUserPrompt(input.question, input.context) },
      ],
    }),
  }, {
    feature: 'clinical_copilot',
    model,
    tenantId: input.tenantId,
    userId: input.userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI copilot error: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as any;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI copilot returned an empty response');
  }

  return {
    ...parseJsonPayload(content),
    provider: 'openai',
    model,
  };
}

async function askAnthropic(input: AskClinicalCopilotInput): Promise<ClinicalCopilotResult> {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Error('Missing Anthropic API key');
  }

  const model = getAnthropicModel();
  const history = sanitizeOutboundHistory(input.history).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.2,
      system: buildSystemPrompt(),
      messages: [
        ...history,
        { role: 'user', content: buildUserPrompt(input.question, input.context) },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic copilot error: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as any;
  const textBlock = Array.isArray(payload?.content)
    ? payload.content.find((item: any) => item?.type === 'text')
    : null;
  const content = textBlock?.text;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Anthropic copilot returned an empty response');
  }

  return {
    ...parseJsonPayload(content),
    provider: 'anthropic',
    model,
  };
}

function pickBestEmCode(context: ClinicalCopilotContext): ClinicalCopilotCodeSuggestion | null {
  const suggested = context.note?.suggestedCptCodes || [];
  const emCodes = suggested.filter((item) => /^99\d{3}$/.test(item.code));
  if (emCodes.length > 0) {
    const top = emCodes[0]!;
    return {
      type: 'em',
      code: top.code,
      description: top.description,
      confidence: typeof top.confidence === 'number' ? top.confidence : 0.78,
      rationale: 'This was already surfaced by the existing AI scribe note output for the encounter.',
    };
  }

  const combined = [
    context.note?.assessment,
    context.note?.plan,
    context.encounter?.assessmentPlan,
    context.encounter?.hpi,
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ')
    .toLowerCase();

  const hasPrescriptionManagement = /prescri|ketoconazole|triamcinolone|clobetasol|doxycycline|tretinoin|isotretinoin|refill|medication management/.test(combined);
  const hasChronicCondition = /seborrheic|psoriasis|eczema|dermatitis|acne|rosacea|melanoma|chronic/.test(combined);
  const hasCounseling = /counsel|expectations|follow up|education/.test(combined);

  if (hasPrescriptionManagement && (hasChronicCondition || hasCounseling)) {
    return {
      type: 'em',
      code: '99214',
      description: 'Established patient office visit, moderate medical decision making',
      confidence: 0.64,
      rationale: 'The chart suggests chronic disease management with prescription therapy and counseling, which may support moderate MDM if documentation is complete.',
    };
  }

  return {
    type: 'em',
    code: '99213',
    description: 'Established patient office visit, low medical decision making',
    confidence: 0.62,
    rationale: 'The chart supports a straightforward established-patient dermatology follow-up, but the final level depends on documented complexity and prescription management details.',
  };
}

function buildMockResult(question: string, context: ClinicalCopilotContext): ClinicalCopilotResult {
  const bestEm = pickBestEmCode(context);
  const codeSuggestions: ClinicalCopilotCodeSuggestion[] = [];
  if (bestEm) {
    codeSuggestions.push(bestEm);
  }

  for (const code of context.note?.suggestedCptCodes || []) {
    if (codeSuggestions.some((item) => item.code === code.code)) continue;
    codeSuggestions.push({
      type: /^99\d{3}$/.test(code.code) ? 'em' : 'cpt',
      code: code.code,
      description: code.description,
      confidence: typeof code.confidence === 'number' ? code.confidence : 0.58,
      rationale: 'Pulled from the existing AI scribe note suggestions for clinician review.',
    });
    if (codeSuggestions.length >= 4) break;
  }

  for (const code of context.note?.suggestedIcd10Codes || []) {
    codeSuggestions.push({
      type: 'icd10',
      code: code.code,
      description: code.description,
      confidence: typeof code.confidence === 'number' ? code.confidence : 0.6,
      rationale: 'Pulled from the existing AI scribe differential/diagnosis suggestions.',
    });
    if (codeSuggestions.length >= 6) break;
  }

  const followUpTasks = dedupeStrings([
    ...(context.note?.followUpTasks || []).map((task) => {
      const due = task.dueDate ? ` (${task.dueDate})` : '';
      return `${task.task}${due}`;
    }),
    context.note?.patientSummary?.followUp,
  ]);

  const patientInstructions = dedupeStrings([
    context.note?.patientSummary?.treatmentPlan,
    context.note?.plan,
  ]).slice(0, 4);

  const missingData = dedupeStrings([
    !context.note?.physicalExam && !context.encounter?.exam ? 'Document a clearer physical exam if billing or coding needs stronger support.' : undefined,
    !context.note?.ros && !context.encounter?.ros ? 'ROS is sparse or missing.' : undefined,
    !context.note?.assessment && !context.encounter?.assessmentPlan ? 'Assessment reasoning is limited.' : undefined,
    !context.transcriptExcerpt ? 'No transcript excerpt was available for copilot grounding.' : undefined,
  ]);

  const chartEvidence = dedupeStrings([
    context.note?.chiefComplaint || context.encounter?.chiefComplaint,
    context.note?.assessment,
    context.note?.plan,
    context.note?.patientSummary?.whatWeDiscussed,
    ...(context.note?.recommendedTests || []).map((test) => `${test.testName}: ${test.rationale || 'Suggested by scribe note.'}`),
  ]).slice(0, 6);

  const questionLower = question.toLowerCase();
  const summary = context.note?.patientSummary?.whatWeDiscussed
    || context.note?.assessment
    || context.encounter?.assessmentPlan
    || context.encounter?.chiefComplaint
    || 'The copilot needs more chart detail to generate a strong visit summary.';

  let answer = 'The local copilot mock is active because no live AI provider key is configured. It is answering from the chart context only.';
  if (/\b(ov|office visit|992|e\/m|em code|visit code)\b/.test(questionLower)) {
    const primaryCode = codeSuggestions.find((item) => item.type === 'em');
    answer = primaryCode
      ? `Based on the current chart, ${primaryCode.code} is the strongest office-visit starting point. ${primaryCode.rationale}`
      : 'I do not have enough encounter detail to suggest an office-visit code confidently.';
  } else if (/summary|summarize|what happened/.test(questionLower)) {
    answer = summary;
  } else if (/patient instruction|instruction|aftercare|home care/.test(questionLower)) {
    answer = patientInstructions[0] || 'No patient-friendly instructions are documented clearly enough yet.';
  } else if (/missing|gap|what should i document/.test(questionLower)) {
    answer = missingData[0] || 'The current note is fairly complete, but clinician review is still required.';
  }

  return {
    answer,
    visitSummary: summary,
    suggestedCodes: codeSuggestions.slice(0, 6),
    followUpTasks,
    patientInstructions,
    missingData,
    chartEvidence,
    provider: 'mock',
    model: 'local-chart-mock-v1',
  };
}

export async function askClinicalCopilot(input: AskClinicalCopilotInput): Promise<ClinicalCopilotResult> {
  try {
    if (getOpenAIKey() || getAnthropicKey()) {
      assertClinicalAiPromptIsSafeForExternalAi({
        prompt: input.question,
        history: input.history,
      });
    }
    if (getOpenAIKey()) {
      return await askOpenAI(input);
    }
    if (getAnthropicKey()) {
      return await askAnthropic(input);
    }
  } catch (error) {
    if (error instanceof AiPhiBlockError) {
      throw error;
    }
    logger.warn('Clinical copilot provider failed, falling back to mock', {
      error: toSafeErrorMessage(error),
    });
  }

  return buildMockResult(input.question, input.context);
}
