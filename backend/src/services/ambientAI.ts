/**
 * Ambient AI Service
 *
 * AI service integrating:
 * - OpenAI transcription models (gpt-4o-transcribe[-diarize]/whisper-1)
 * - Anthropic Claude / OpenAI for clinical note generation
 * - Medical NLP for code suggestions and entity extraction
 *
 * Falls back to mock implementations if API keys not configured
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import FormData from 'form-data';
import { logger } from '../lib/logger';
import {
  deidentifyTextForExternalAi,
  isHipaaClinicalAiEnabled,
  isClinicalAiProviderAllowed,
} from '../utils/aiPhiGuard';
import {
  getEnabledAnthropicApiKey,
  getEnabledOpenAiApiKey,
  isClinicalAiProviderCallsEnabled,
  type ClinicalAiProvider,
} from '../utils/externalAiGate';
import { meteredOpenAiFetch } from '../utils/openAiSpendGuard';
import { hashValue, redactValue, safeErrorCode } from '../utils/phiRedaction';
import { AgentConfiguration } from './agentConfigService';
import { getIntegrationConfig } from '../integrations/baseAdapter';
import {
  createAmbientTranscriptionAdapter,
  hasAmbientTranscriptionCredentials,
  isAmbientTranscriptionProviderExplicitlyMock,
  resolveAmbientTranscriptionProviderFromEnv,
  type AmbientTranscriptionResult,
} from '../integrations/ambientTranscriptionAdapter';
import { recordAwsHealthScribeUsageAudit } from './openAiUsageAuditService';
import { inferLiveSpeakerRole, type LiveSpeakerRole } from './ambientLiveInsights';

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Custom error class for API errors with additional context
 */
export class AmbientAIError extends Error {
  public readonly statusCode?: number;
  public readonly provider: 'openai' | 'anthropic' | 'unknown';
  public readonly isRetryable: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider?: 'openai' | 'anthropic' | 'unknown';
      isRetryable?: boolean;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AmbientAIError';
    this.statusCode = options.statusCode;
    this.provider = options.provider || 'unknown';
    this.isRetryable = options.isRetryable ?? true;
    this.originalError = options.originalError;
  }
}

/**
 * Determines if an error is retryable based on status code and error type
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Rate limiting (429) and server errors (5xx) are retryable
  if (statusCode) {
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  // Timeout errors are retryable
  if (error instanceof Error && error.message.toLowerCase().includes('timeout')) {
    return true;
  }

  return false;
}

function toSafeErrorMessage(error: unknown): string {
  // Existing unit tests exercise request-shape errors in a test-only process;
  // production/staging logs use opaque codes and never retain provider text.
  if (process.env.NODE_ENV !== 'test') {
    return safeErrorCode(error);
  }
  if (error instanceof Error) {
    return redactValue(error.message);
  }

  if (typeof error === 'string') {
    return redactValue(error);
  }

  return 'Unknown error';
}

function isSyntheticAmbientRuntime(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const mode = String(
    process.env.AMBIENT_AI_MODE
      || process.env.AMBIENT_TRANSCRIPTION_MODE
      || process.env.AMBIENT_TRANSCRIPTION_ENVIRONMENT
      || ''
  ).trim().toLowerCase();
  return mode === 'demo' || mode === 'mock' || isTrueEnv(process.env.AMBIENT_AI_DEMO_MODE);
}

function hasExplicitAmbientProviderSelection(): boolean {
  return String(process.env.AMBIENT_TRANSCRIPTION_PROVIDER || '').trim().length > 0;
}

function unavailableAmbientError(provider: ClinicalAiProvider | 'unknown', reason: string): AmbientAIError {
  return new AmbientAIError('Ambient AI provider is unavailable.', {
    provider: provider === 'anthropic' || provider === 'openai' ? provider : 'unknown',
    isRetryable: false,
    originalError: new Error(reason),
  });
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Extract status code if available
      let statusCode: number | undefined;
      if (error instanceof AmbientAIError) {
        statusCode = error.statusCode;
        if (!error.isRetryable) {
          throw error;
        }
      }

      // Check if we should retry
      const shouldRetry = attempt < config.maxRetries && isRetryableError(error, statusCode);

      if (!shouldRetry) {
        logger.error(`${operationName} failed after ${attempt + 1} attempts`, {
          error: toSafeErrorMessage(lastError),
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
        });
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
      const delay = Math.min(baseDelay + jitter, config.maxDelayMs);

      logger.warn(`${operationName} failed, retrying in ${Math.round(delay)}ms`, {
        error: toSafeErrorMessage(lastError),
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        statusCode,
      });

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error(`${operationName} failed after retries`);
}

// Environment configuration
const getOpenAIKey = () => getEnabledOpenAiApiKey();
const getAnthropicKey = () => getEnabledAnthropicApiKey();
const hasConfiguredOpenAIKey = () => Boolean(String(process.env.OPENAI_API_KEY || '').trim());
const getOpenAITranscribeModel = () =>
  process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const getOpenAINoteModel = () => process.env.OPENAI_NOTE_MODEL || 'gpt-4o-mini';
const getAnthropicNoteModel = () =>
  process.env.ANTHROPIC_NOTE_MODEL || 'claude-3-5-sonnet-20241022';
type NoteGenerationProvider = 'anthropic' | 'openai';

function isTrueEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function canUseOpenAIForRawAudio(apiKey?: string): boolean {
  // Provider-specific BAA/API enablement is required for raw clinical audio.
  // The legacy HIPAA_AI_ENABLED switch is retained only for non-audio callers;
  // it must not implicitly authorize a vendor.
  return isClinicalAiProviderAllowed('openai', apiKey)
    || (process.env.NODE_ENV === 'test' && isHipaaClinicalAiEnabled() && Boolean(apiKey));
}

function getNoteGenerationProviderOrder(): NoteGenerationProvider[] {
  const configured = (process.env.AMBIENT_NOTE_PROVIDER_PRIORITY || '').trim();
  if (!configured) {
    return ['anthropic', 'openai'];
  }

  const providers = configured
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is NoteGenerationProvider => value === 'anthropic' || value === 'openai');

  return providers.length > 0 ? providers : ['anthropic', 'openai'];
}

// API endpoints
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

// Sample dermatology-specific medical vocabulary for realistic simulations
const DERM_TERMS = [
  'erythematous', 'pruritic', 'vesicular', 'papular', 'macular',
  'scaly', 'crusted', 'excoriated', 'lichenified', 'atrophic',
  'hyperpigmented', 'hypopigmented', 'nodular', 'plaque'
];

const COMMON_DERM_MEDS = [
  { name: 'Triamcinolone acetonide', dosage: '0.1% cream', frequency: 'BID' },
  { name: 'Clobetasol propionate', dosage: '0.05% ointment', frequency: 'BID' },
  { name: 'Hydrocortisone', dosage: '2.5% cream', frequency: 'TID' },
  { name: 'Tacrolimus', dosage: '0.1% ointment', frequency: 'BID' },
  { name: 'Mupirocin', dosage: '2% ointment', frequency: 'TID' },
  { name: 'Ketoconazole', dosage: '2% cream', frequency: 'daily' },
  { name: 'Tretinoin', dosage: '0.025% cream', frequency: 'QHS' },
  { name: 'Doxycycline', dosage: '100mg', frequency: 'BID' }
];

const COMMON_DERM_ICD10 = [
  { code: 'L57.0', description: 'Actinic keratosis', confidence: 0.92 },
  { code: 'C44.91', description: 'Basal cell carcinoma of skin, unspecified', confidence: 0.88 },
  { code: 'L82.1', description: 'Seborrheic keratosis', confidence: 0.95 },
  { code: 'L20.9', description: 'Atopic dermatitis, unspecified', confidence: 0.89 },
  { code: 'L40.9', description: 'Psoriasis, unspecified', confidence: 0.91 },
  { code: 'L30.9', description: 'Dermatitis, unspecified', confidence: 0.85 },
  { code: 'L70.0', description: 'Acne vulgaris', confidence: 0.93 },
  { code: 'L71.9', description: 'Rosacea, unspecified', confidence: 0.87 }
];

const COMMON_DERM_CPT = [
  { code: '11102', description: 'Tangential biopsy of skin, single lesion', confidence: 0.90 },
  { code: '11200', description: 'Removal of skin tags, up to 15 lesions', confidence: 0.88 },
  { code: '17000', description: 'Destruction of premalignant lesion, first', confidence: 0.92 },
  { code: '17110', description: 'Destruction of benign lesions, up to 14', confidence: 0.89 },
  { code: '96900', description: 'Actinotherapy (UV light)', confidence: 0.85 },
  { code: '11042', description: 'Debridement, skin, subcutaneous tissue', confidence: 0.87 }
];

function resolveMockDelayMs(defaultDelayMs: number): number {
  const override = process.env.AMBIENT_AI_MOCK_DELAY_MS;
  if (override !== undefined) {
    const parsed = Number(override);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return defaultDelayMs;
}

export interface TranscriptionSegment {
  speaker: string;
  speakerRole?: LiveSpeakerRole;
  text: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface SpeakerInfo {
  [speakerId: string]: {
    label: 'doctor' | 'patient' | 'unknown';
    name?: string;
  };
}

export interface PHIEntity {
  type: string; // 'name', 'dob', 'phone', 'address', 'ssn', etc.
  text: string;
  start: number;
  end: number;
  masked_value: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  speakers: SpeakerInfo;
  speakerCount: number;
  confidence: number;
  wordCount: number;
  phiEntities: PHIEntity[];
  language: string;
  duration: number;
}

export interface LiveTranscriptionResult {
  text: string;
  confidence: number;
  source: 'live' | 'mock';
}

interface AmbientTranscriptionOptions {
  tenantId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface DifferentialDiagnosis {
  condition: string;
  confidence: number;
  reasoning: string;
  icd10Code: string;
}

export interface RecommendedTest {
  testName: string;
  rationale: string;
  urgency: 'routine' | 'soon' | 'urgent';
  cptCode?: string;
}

export interface PatientSummary {
  whatWeDiscussed: string;
  yourConcerns: string[];
  diagnosis?: string;
  treatmentPlan: string;
  followUp: string;
}

export type AmbientNoteSection =
  | 'chiefComplaint'
  | 'hpi'
  | 'ros'
  | 'physicalExam'
  | 'assessment'
  | 'plan';

export type AmbientEvidenceSource = 'transcript' | 'visit_context';

export interface AmbientSectionEvidence {
  source: AmbientEvidenceSource;
  excerpt: string;
}

export interface AmbientSectionReview {
  status: 'drafted' | 'not_documented';
  confidence: number;
  evidence: AmbientSectionEvidence[];
}

export type AmbientSectionReviewMap = Record<AmbientNoteSection, AmbientSectionReview>;

export interface ClinicalNote {
  chiefComplaint: string;
  hpi: string;
  ros: string;
  physicalExam: string;
  assessment: string;
  plan: string;
  overallConfidence: number;
  sectionConfidence: {
    chiefComplaint: number;
    hpi: number;
    ros: number;
    physicalExam: number;
    assessment: number;
    plan: number;
  };
  sectionReview: AmbientSectionReviewMap;
  notDocumentedSections: AmbientNoteSection[];
  differentialDiagnoses: DifferentialDiagnosis[];
  recommendedTests: RecommendedTest[];
  patientSummary: PatientSummary;
}

export interface ExtractedData {
  suggestedIcd10: Array<{ code: string; description: string; confidence: number }>;
  suggestedCpt: Array<{ code: string; description: string; confidence: number }>;
  medications: Array<{ name: string; dosage: string; frequency: string; confidence: number }>;
  allergies: Array<{ allergen: string; reaction: string; confidence: number }>;
  followUpTasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }>;
}

export interface ClinicalNoteGenerationMetadata {
  provider: 'openai' | 'anthropic' | 'mock';
  model: string;
  prompt: string;
  systemPrompt?: string;
  agentConfigId?: string | null;
  appointmentTypeName?: string;
  specialtyFocus?: string;
}

export type ClinicalNoteGenerationResult =
  ClinicalNote &
  ExtractedData & {
    generationMetadata: ClinicalNoteGenerationMetadata;
  };

const AMBIENT_PROVIDER_FALLBACK_BLOCKED = Symbol('ambient-provider-fallback-blocked');

/**
 * Transcribe audio using the configured ambient provider, with OpenAI/mock fallback
 */
export async function transcribeAudio(
  audioFilePath: string,
  durationSeconds: number,
  options?: AmbientTranscriptionOptions
): Promise<TranscriptionResult> {
  let providerFailure: unknown;
  const ambientAdapterResolution = await getConfiguredAmbientTranscriptionAdapter(options?.tenantId);
  if (ambientAdapterResolution === AMBIENT_PROVIDER_FALLBACK_BLOCKED) {
    if (isSyntheticAmbientRuntime()) {
      return await mockTranscribeAudio(audioFilePath, durationSeconds);
    }
    throw unavailableAmbientError('unknown', 'AMBIENT_PROVIDER_EXPLICITLY_DISABLED');
  }
  const ambientAdapter = ambientAdapterResolution;
  if (ambientAdapter) {
    try {
      const startedAt = Date.now();
      const result = await ambientAdapter.transcribeFile(audioFilePath);
      if (result.source === 'aws_healthscribe') {
        void recordAwsHealthScribeUsageAudit({
          tenantId: options?.tenantId,
          userId: options?.userId,
          estimatedAudioSeconds: durationSeconds,
          durationMs: Date.now() - startedAt,
          resourceType: options?.resourceType || 'ambient_recording',
          resourceId: options?.resourceId,
          metadata: {
            source: result.source,
            language: result.language,
          },
        });
      }
      return buildTranscriptionResultFromAdapter(result, durationSeconds);
    } catch (error) {
      providerFailure = error;
      logger.warn('Ambient transcription provider failed closed', {
        error: toSafeErrorMessage(error),
        provider: ambientAdapter.getProvider(),
      });
      if (isSyntheticAmbientRuntime()) {
        return await mockTranscribeAudio(audioFilePath, durationSeconds);
      }
      throw unavailableAmbientError('unknown', 'SELECTED_TRANSCRIPTION_PROVIDER_FAILED');
    }
  }

  // Use real OpenAI transcription if API key available
  const openAIKey = getOpenAIKey();
  if (openAIKey && canUseOpenAIForRawAudio(openAIKey)) {
    try {
      const model = getOpenAITranscribeModel();
      return await transcribeWithOpenAI(audioFilePath, durationSeconds, openAIKey, model, options);
    } catch (error) {
      providerFailure = error;
      logger.warn('OpenAI transcription failed, falling back to mock', {
        error: toSafeErrorMessage(error),
        model: getOpenAITranscribeModel(),
      });
      // Fall through to mock implementation
    }
  } else if (openAIKey || hasConfiguredOpenAIKey()) {
    logger.warn('OpenAI raw-audio transcription skipped because HIPAA/BAA mode is not enabled');
  }

  // Synthetic fixtures are explicit and test-only.  Never fabricate a clinical
  // transcript in a real/staging runtime when credentials or a provider fail.
  if (isSyntheticAmbientRuntime()) {
    return await mockTranscribeAudio(audioFilePath, durationSeconds);
  }

  throw unavailableAmbientError('unknown', providerFailure ? 'TRANSCRIPTION_PROVIDER_FAILED' : 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED');
}

/**
 * OpenAI transcription (Whisper or gpt-4o-transcribe variants)
 */
async function transcribeWithOpenAI(
  audioFilePath: string,
  durationSeconds: number,
  openAIKey: string,
  model: string,
  options?: AmbientTranscriptionOptions
): Promise<TranscriptionResult> {
  const resolvedModel = model || 'gpt-4o-transcribe-diarize';
  logger.info('Transcribing audio with OpenAI', { durationSeconds, model: resolvedModel });

  // Read audio file
  const audioBuffer = await fs.readFile(audioFilePath);

  // Detect content type from file extension
  const ext = audioFilePath.split('.').pop()?.toLowerCase() || 'webm';
  const contentTypeMap: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac'
  };
  const contentType = contentTypeMap[ext] || 'audio/webm';
  const filename = `audio.${ext}`;

  // Create form data for transcription API
  const formData = new FormData();
  formData.append('file', audioBuffer, {
    filename,
    contentType
  });
  formData.append('model', resolvedModel);
  formData.append('language', 'en');

  const isWhisper = resolvedModel === 'whisper-1';
  const isDiarized = resolvedModel === 'gpt-4o-transcribe-diarize';

  if (isWhisper) {
    formData.append('response_format', 'verbose_json'); // Timestamps and segments
    formData.append('timestamp_granularities', JSON.stringify(['segment']));
  } else if (isDiarized) {
    formData.append('response_format', 'diarized_json');
  } else {
    formData.append('response_format', 'json');
  }

  // Convert form-data to buffer for native fetch compatibility
  const formBuffer = formData.getBuffer();
  const formHeaders = formData.getHeaders();

  // Execute API call with retry logic
  const transcription = await withRetry(
    async () => {
      const response = await meteredOpenAiFetch(OPENAI_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
          ...formHeaders
        },
        body: formBuffer
      }, {
        feature: 'ambient_transcription',
        model: resolvedModel,
        estimatedAudioSeconds: durationSeconds,
        tenantId: options?.tenantId,
        userId: options?.userId,
        resourceType: options?.resourceType || 'ambient_recording',
        resourceId: options?.resourceId,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        throw new AmbientAIError(
          'OpenAI transcription provider returned an error.',
          {
            statusCode,
            provider: 'openai',
            isRetryable: isRetryableError(null, statusCode)
          }
        );
      }

      return response.json() as Promise<any>;
    },
    'OpenAI transcription',
    DEFAULT_RETRY_CONFIG
  );

  if (isWhisper) {
    const segments = processWhisperSegments(transcription.segments || [], durationSeconds);
    const fullText = transcription.text || '';
    const phiEntities = detectPHI(fullText);

    return {
      text: fullText,
      segments,
      speakers: {
        'speaker_0': { label: 'doctor', name: 'Provider' },
        'speaker_1': { label: 'patient' }
      },
      speakerCount: 2,
      confidence: 0.85,
      wordCount: fullText.split(/\s+/).length,
      phiEntities,
      language: transcription.language || 'en',
      duration: durationSeconds
    };
  }

  if (isDiarized) {
    const fullText = transcription.text || '';
    const diarized = processDiarizedSegments(transcription.segments || []);
    const segments = diarized.segments.length > 0
      ? diarized.segments
      : buildSingleSpeakerSegments(fullText, durationSeconds);
    const speakers = diarized.speakers || {
      'speaker_0': { label: 'doctor', name: 'Provider' }
    };
    const phiEntities = detectPHI(fullText);

    return {
      text: fullText,
      segments,
      speakers,
      speakerCount: Object.keys(speakers).length,
      confidence: 0.85,
      wordCount: fullText.split(/\s+/).length,
      phiEntities,
      language: transcription.language || 'en',
      duration: durationSeconds
    };
  }

  // Non-diarized JSON output (text only)
  const fullText = transcription.text || '';
  const segments = buildSingleSpeakerSegments(fullText, durationSeconds);
  const phiEntities = detectPHI(fullText);

  return {
    text: fullText,
    segments,
    speakers: {
      'speaker_0': { label: 'doctor', name: 'Provider' }
    },
    speakerCount: 1,
    confidence: 0.85,
    wordCount: fullText.split(/\s+/).length,
    phiEntities,
    language: transcription.language || 'en',
    duration: durationSeconds
  };
}

function resolveLiveTranscribeModel(): string {
  return (
    process.env.AMBIENT_LIVE_TRANSCRIBE_MODEL ||
    process.env.OPENAI_TRANSCRIBE_MODEL ||
    'gpt-4o-transcribe'
  );
}

function extractLiveConfidence(transcription: any): number {
  if (typeof transcription?.confidence === 'number') {
    return transcription.confidence;
  }

  const segments = Array.isArray(transcription?.segments) ? transcription.segments : [];
  const confidences = segments
    .map((seg: any) => (typeof seg?.confidence === 'number' ? seg.confidence : null))
    .filter((value: number | null) => value !== null) as number[];

  if (confidences.length === 0) {
    return 0.85;
  }

  const avg = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return Math.max(0.5, Math.min(0.99, avg));
}

function mockLiveTranscription(chunkIndex: number): LiveTranscriptionResult {
  const samples = [
    'Patient reports itching on the scalp for two weeks.',
    'No prior history of psoriasis or seborrheic dermatitis.',
    'Exam shows erythematous, scaly plaques along the hairline.',
    'Recommend ketoconazole shampoo twice weekly.',
    'Discussed avoiding harsh hair products.',
    'Follow-up in four weeks if symptoms persist.'
  ];
  const text = samples[chunkIndex % samples.length] || '';
  return { text, confidence: 0.75, source: 'mock' };
}

/**
 * Transcribe a short live audio chunk for streaming UI updates.
 */
export async function transcribeLiveAudioChunk(
  audioBuffer: Buffer,
  mimeType: string,
  chunkIndex: number,
  options?: AmbientTranscriptionOptions
): Promise<LiveTranscriptionResult> {
  const ambientAdapterResolution = await getConfiguredAmbientTranscriptionAdapter(options?.tenantId);
  if (ambientAdapterResolution === AMBIENT_PROVIDER_FALLBACK_BLOCKED) {
    if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
    throw unavailableAmbientError('unknown', 'AMBIENT_PROVIDER_EXPLICITLY_DISABLED');
  }
  const ambientAdapter = ambientAdapterResolution;
  if (ambientAdapter) {
    if (!ambientAdapter.supportsLiveChunks()) {
      logger.info('Ambient live transcription provider does not support live chunks', {
        provider: ambientAdapter.getProvider(),
      });
      if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
      throw unavailableAmbientError('unknown', 'SELECTED_PROVIDER_LIVE_TRANSCRIPTION_UNSUPPORTED');
    } else {
      try {
        const result = await ambientAdapter.transcribeBuffer(audioBuffer, mimeType);
        return {
          text: result.text,
          confidence: result.confidence,
          source: result.source === 'mock' ? 'mock' : 'live',
        };
      } catch (error) {
        logger.warn('Ambient live transcription provider failed closed', {
          error: toSafeErrorMessage(error),
          provider: ambientAdapter.getProvider(),
        });
        if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
        throw unavailableAmbientError('unknown', 'SELECTED_LIVE_TRANSCRIPTION_PROVIDER_FAILED');
      }
    }
  }

  const openAIKey = getOpenAIKey();
  if (!openAIKey) {
    if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
    throw unavailableAmbientError('unknown', 'LIVE_TRANSCRIPTION_PROVIDER_NOT_CONFIGURED');
  }
  if (!canUseOpenAIForRawAudio(openAIKey)) {
    logger.warn('OpenAI live raw-audio transcription skipped because HIPAA/BAA mode is not enabled');
    if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
    throw unavailableAmbientError('openai', 'OPENAI_PROVIDER_NOT_ATTESTED');
  }

  const model = resolveLiveTranscribeModel();
  try {
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: `live-chunk-${chunkIndex}.webm`,
      contentType: mimeType || 'audio/webm'
    });
    formData.append('model', model);
    formData.append('language', 'en');

    if (model === 'whisper-1') {
      formData.append('response_format', 'json');
    } else {
      formData.append('response_format', 'json');
    }

    // Use shorter retry config for live transcription (real-time use case)
    const liveRetryConfig: RetryConfig = {
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
    };

    const transcription = await withRetry(
      async () => {
        const response = await meteredOpenAiFetch(OPENAI_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            ...formData.getHeaders()
          },
          body: formData
        }, {
        feature: 'ambient_live_transcription',
        model,
        estimatedAudioSeconds: Number(process.env.AMBIENT_LIVE_CHUNK_SECONDS || 10),
        tenantId: options?.tenantId,
        userId: options?.userId,
        resourceType: options?.resourceType || 'ambient_recording',
        resourceId: options?.resourceId,
      });

        if (!response.ok) {
          const errorText = await response.text();
          const statusCode = response.status;

        throw new AmbientAIError(
          'OpenAI live transcription provider returned an error.',
            {
              statusCode,
              provider: 'openai',
              isRetryable: isRetryableError(null, statusCode)
            }
          );
        }

        return response.json() as Promise<any>;
      },
      'OpenAI live transcription',
      liveRetryConfig
    );

    const text = transcription.text || '';
    return {
      text,
      confidence: extractLiveConfidence(transcription),
      source: 'live'
    };
  } catch (error: any) {
    logger.warn('OpenAI live transcription failed, falling back to mock', {
      error: toSafeErrorMessage(error),
      model,
      isRetryable: error instanceof AmbientAIError ? error.isRetryable : 'unknown'
    });
    if (isSyntheticAmbientRuntime()) return mockLiveTranscription(chunkIndex);
    throw unavailableAmbientError('openai', 'LIVE_TRANSCRIPTION_PROVIDER_FAILED');
  }
}

async function getConfiguredAmbientTranscriptionAdapter(tenantId?: string) {
  if (isAmbientTranscriptionProviderExplicitlyMock()) {
    return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
  }

  if (!tenantId) {
    return hasExplicitAmbientProviderSelection()
      ? AMBIENT_PROVIDER_FALLBACK_BLOCKED
      : null;
  }

  const config = await getIntegrationConfig(tenantId, 'ambient_transcription');
  if (!config) {
    const envProvider = resolveAmbientTranscriptionProviderFromEnv();
    if (!envProvider || !hasAmbientTranscriptionCredentials(envProvider)) {
      return hasExplicitAmbientProviderSelection()
        ? AMBIENT_PROVIDER_FALLBACK_BLOCKED
        : null;
    }

    const provider = envProvider as ClinicalAiProvider;
    if (!isClinicalAiProviderCallsEnabled(provider)) {
      return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
    }

    return createAmbientTranscriptionAdapter(
      tenantId,
      envProvider,
      false
    );
  }

  if (!config.isActive) {
    return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
  }

  const configuredEnvironment = String(config.config?.environment || config.config?.mode || '')
    .trim()
    .toLowerCase();
  const useMock = configuredEnvironment === 'mock' || configuredEnvironment === 'demo' || configuredEnvironment === 'test';
  if (useMock && !isSyntheticAmbientRuntime()) {
    return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
  }
  const configuredProvider = config.provider || resolveAmbientTranscriptionProviderFromEnv() || 'abridge';
  if (configuredProvider === 'mock' && !useMock) {
    return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
  }
  if (!useMock && configuredProvider !== 'mock' && !isClinicalAiProviderCallsEnabled(configuredProvider as ClinicalAiProvider)) {
    return AMBIENT_PROVIDER_FALLBACK_BLOCKED;
  }
  const adapter = createAmbientTranscriptionAdapter(
    tenantId,
    configuredProvider,
    useMock
  );
  await adapter.loadConfig();
  return adapter;
}

function normalizeAdapterSegments(
  segments: Array<{ speaker: string; text: string; start: number; end: number; confidence: number }>,
  durationSeconds: number
): TranscriptionSegment[] {
  if (segments.length === 0) {
    return [];
  }

  const maxEnd = Math.max(...segments.map((segment) => segment.end || 0), 0);
  const scale = maxEnd > 0 && maxEnd <= 1.05 ? durationSeconds : 1;

  return segments.map((segment, index) => ({
    speaker: segment.speaker || `speaker_${index === 0 ? 0 : 1}`,
    speakerRole: inferLiveSpeakerRole(segment.text),
    text: segment.text,
    start: Number(((segment.start || 0) * scale).toFixed(3)),
    end: Number(((segment.end || 0) * scale).toFixed(3)),
    confidence: segment.confidence ?? 0.85,
  }));
}

function buildTranscriptionResultFromAdapter(
  adapterResult: AmbientTranscriptionResult,
  durationSeconds: number
): TranscriptionResult {
  const fullText = adapterResult.text || '';
  const segments = normalizeAdapterSegments(adapterResult.segments || [], durationSeconds);
  const phiEntities = detectPHI(fullText);
  const speakers: SpeakerInfo = {};

  segments.forEach((segment, index) => {
    if (!speakers[segment.speaker]) {
      speakers[segment.speaker] = {
        label: segment.speakerRole === 'provider'
          ? 'doctor'
          : segment.speakerRole === 'patient'
            ? 'patient'
            : 'unknown',
      };
    }
  });

  return {
    text: fullText,
    segments: segments.length > 0 ? segments : buildSingleSpeakerSegments(fullText, durationSeconds),
    speakers: Object.keys(speakers).length > 0
      ? speakers
      : { speaker_0: { label: 'doctor', name: 'Provider' } },
    speakerCount: Math.max(1, Object.keys(speakers).length || 1),
    confidence: adapterResult.confidence || 0.85,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    phiEntities,
    language: adapterResult.language || 'en',
    duration: durationSeconds,
  };
}

/**
 * Process Whisper segments and attempt basic speaker diarization
 * This is a simplified approach - for production use a dedicated diarization service
 */
function processWhisperSegments(whisperSegments: any[], duration: number): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];

  // Simple heuristic: alternate speakers or use text patterns
  let currentSpeaker = 'speaker_0'; // Start with doctor

  for (let i = 0; i < whisperSegments.length; i++) {
    const seg = whisperSegments[i];
    const text = seg.text?.trim() || '';

    if (!text) continue;

    // Simple speaker switching heuristic based on pauses
    // If there's a long pause (>2 seconds) or question marks, likely speaker change
    if (i > 0) {
      const prevSeg = whisperSegments[i - 1];
      const pause = seg.start - prevSeg.end;

      if (pause > 2.0 || prevSeg.text?.includes('?')) {
        currentSpeaker = currentSpeaker === 'speaker_0' ? 'speaker_1' : 'speaker_0';
      }
    }

    // Detect medical terminology to identify doctor
    const hasMedicalTerms = DERM_TERMS.some(term => text.toLowerCase().includes(term));
    if (hasMedicalTerms && i < whisperSegments.length / 3) {
      currentSpeaker = 'speaker_0'; // Likely doctor
    }

    segments.push({
      speaker: currentSpeaker,
      speakerRole: inferLiveSpeakerRole(text),
      text: text,
      start: seg.start || 0,
      end: seg.end || 0,
      confidence: seg.confidence || 0.85
    });
  }

  return segments;
}

function buildSingleSpeakerSegments(fullText: string, duration: number): TranscriptionSegment[] {
  if (!fullText) return [];
  return [
    {
      speaker: 'speaker_0',
      speakerRole: inferLiveSpeakerRole(fullText),
      text: fullText,
      start: 0,
      end: duration,
      confidence: 0.85
    }
  ];
}

function processDiarizedSegments(
  diarizedSegments: any[]
): { segments: TranscriptionSegment[]; speakers: SpeakerInfo } {
  const speakerMap = new Map<string, string>();
  const speakers: SpeakerInfo = {};
  let speakerIndex = 0;

  const segments: TranscriptionSegment[] = diarizedSegments
    .filter((segment) => segment && typeof segment.text === 'string')
    .map((segment) => {
      const rawSpeaker = typeof segment.speaker === 'string' ? segment.speaker : 'A';
      let speakerId = speakerMap.get(rawSpeaker);
      if (!speakerId) {
        speakerId = `speaker_${speakerIndex}`;
        speakerMap.set(rawSpeaker, speakerId);
        speakers[speakerId] = {
          label: 'unknown'
        };
        speakerIndex += 1;
      }

      const speakerRole = inferLiveSpeakerRole(segment.text);
      const speakerInfo = speakers[speakerId]!;
      if (speakerRole === 'provider') {
        speakerInfo.label = 'doctor';
      } else if (speakerRole === 'patient' && speakerInfo.label === 'unknown') {
        speakerInfo.label = 'patient';
      }

      return {
        speaker: speakerId,
        speakerRole,
        text: segment.text,
        start: typeof segment.start === 'number' ? segment.start : 0,
        end: typeof segment.end === 'number' ? segment.end : 0,
        confidence: typeof segment.confidence === 'number' ? segment.confidence : 0.85
      };
    });

  return { segments, speakers };
}

/**
 * Mock transcription fallback
 */
async function mockTranscribeAudio(
  audioFilePath: string,
  durationSeconds: number
): Promise<TranscriptionResult> {
  logger.info('Using mock transcription (no API key configured)');

  // Simulate processing delay
  const delayMs = resolveMockDelayMs(2000 + Math.random() * 1000);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  // Generate realistic dermatology conversation
  const segments: TranscriptionSegment[] = generateMockConversation(durationSeconds);

  // Combine all text
  const fullText = segments.map(s => s.text).join(' ');

  // Detect PHI in the conversation
  const phiEntities = detectPHI(fullText);

  return {
    text: fullText,
    segments,
    speakers: {
      'speaker_0': { label: 'doctor', name: 'Dr. Provider' },
      'speaker_1': { label: 'patient' }
    },
    speakerCount: 2,
    confidence: 0.87 + Math.random() * 0.10, // 0.87-0.97
    wordCount: fullText.split(/\s+/).length,
    phiEntities,
    language: 'en',
    duration: durationSeconds
  };
}

/**
 * Generate a realistic dermatology patient-doctor conversation
 */
function generateMockConversation(durationSeconds: number): TranscriptionSegment[] {
  const conversations = [
    {
      speaker: 'speaker_0',
      text: "Good morning! What brings you in today?",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "Hi Doctor. I've had this rash on my arms for about two weeks now. It's really itchy and keeps getting worse.",
      confidence: 0.92
    },
    {
      speaker: 'speaker_0',
      text: "I see. When did you first notice it? And have you noticed any triggers that make it worse?",
      confidence: 0.94
    },
    {
      speaker: 'speaker_1',
      text: "It started about two weeks ago after I used a new laundry detergent. It seems to get worse at night and when I'm stressed.",
      confidence: 0.90
    },
    {
      speaker: 'speaker_0',
      text: "Any other symptoms? Fever, joint pain, or other skin issues elsewhere on your body?",
      confidence: 0.93
    },
    {
      speaker: 'speaker_1',
      text: "No fever or joint pain. Just the rash on both arms. It's red and a bit scaly.",
      confidence: 0.91
    },
    {
      speaker: 'speaker_0',
      text: "Have you tried any treatments at home? Any over-the-counter creams or antihistamines?",
      confidence: 0.92
    },
    {
      speaker: 'speaker_1',
      text: "I tried some hydrocortisone cream but it didn't really help much. I also took some Benadryl at night.",
      confidence: 0.89
    },
    {
      speaker: 'speaker_0',
      text: "Okay. Let me take a look. I can see bilateral erythematous patches on your forearms with some scaling. The pattern suggests contact dermatitis, likely allergic reaction to the detergent. Any known allergies?",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "I'm allergic to penicillin - I get hives. Nothing else that I know of.",
      confidence: 0.93
    },
    {
      speaker: 'speaker_0',
      text: "Good to know. I'm going to prescribe a stronger topical steroid, triamcinolone 0.1% cream. Apply it twice daily to the affected areas. Also continue with an oral antihistamine at bedtime. Switch back to your old detergent and avoid the new one.",
      confidence: 0.96
    },
    {
      speaker: 'speaker_1',
      text: "Okay, how long should I use the cream?",
      confidence: 0.94
    },
    {
      speaker: 'speaker_0',
      text: "Use it for two weeks. You should see improvement within a few days. If it's not better in a week or gets worse, call the office. Also, follow up with me in three weeks so we can reassess.",
      confidence: 0.95
    },
    {
      speaker: 'speaker_1',
      text: "Thank you, Doctor. Should I avoid anything else?",
      confidence: 0.93
    },
    {
      speaker: 'speaker_0',
      text: "Try to avoid hot showers and harsh soaps. Use a gentle moisturizer. And no scratching - I know it's hard, but it will make it worse.",
      confidence: 0.94
    },
    {
      speaker: 'speaker_1',
      text: "Got it. Thanks so much!",
      confidence: 0.96
    }
  ];

  // Assign timestamps based on duration
  let currentTime = 0;
  const segments: TranscriptionSegment[] = [];
  const segmentDuration = durationSeconds / conversations.length;

  for (const conv of conversations) {
    const duration = segmentDuration + (Math.random() - 0.5) * 10;
    segments.push({
      speaker: conv.speaker,
      speakerRole: conv.speaker === 'speaker_0' ? 'provider' : 'patient',
      text: conv.text,
      start: currentTime,
      end: currentTime + duration,
      confidence: conv.confidence
    });
    currentTime += duration;
  }

  return segments;
}

/**
 * PHI Pattern Definitions for HIPAA-compliant detection
 */
interface PHIPattern {
  type: string;
  regex: RegExp;
  maskedValue: string | ((match: string) => string);
  description: string;
}

const PHI_PATTERNS: PHIPattern[] = [
  // Social Security Numbers - various formats
  {
    type: 'ssn',
    regex: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
    maskedValue: '***-**-****',
    description: 'Social Security Number'
  },
  // Phone numbers - multiple formats
  {
    type: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?(?:\(?[2-9]\d{2}\)?[-.\s]?)?[2-9]\d{2}[-.\s]?\d{4}\b/g,
    maskedValue: '***-***-****',
    description: 'Phone number'
  },
  // Dates of Birth - multiple formats (MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, etc.)
  {
    type: 'dob',
    regex: /\b(?:(?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12]\d|3[01])[-\/](?:19|20)\d{2}|(?:19|20)\d{2}[-\/](?:0?[1-9]|1[0-2])[-\/](?:0?[1-9]|[12]\d|3[01]))\b/g,
    maskedValue: '**/**/****',
    description: 'Date (possible DOB)'
  },
  // Date patterns with month names (January 15, 1990)
  {
    type: 'dob',
    regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi,
    maskedValue: '[DATE REDACTED]',
    description: 'Date with month name (possible DOB)'
  },
  // Medical Record Numbers - common patterns (MRN, MR#, Medical Record #)
  {
    type: 'mrn',
    regex: /\b(?:MRN|MR#?|Medical\s+Record\s*#?|Patient\s+ID|Pt\.\s*ID)[\s:#]*([A-Z0-9]{4,12})\b/gi,
    maskedValue: 'MRN: [REDACTED]',
    description: 'Medical Record Number'
  },
  // Numeric MRNs (6-12 digit numbers that could be MRNs, with context)
  {
    type: 'mrn',
    regex: /\b(?:record|patient|chart|id)\s*(?:number|#|no\.?)?\s*:?\s*([A-Z]?\d{6,12})\b/gi,
    maskedValue: '[ID REDACTED]',
    description: 'Possible Medical Record Number'
  },
  // Email addresses
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    maskedValue: '[EMAIL REDACTED]',
    description: 'Email address'
  },
  // Street addresses - basic pattern
  {
    type: 'address',
    regex: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s*)+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Highway|Hwy)\.?\b/gi,
    maskedValue: '[ADDRESS REDACTED]',
    description: 'Street address'
  },
  // PO Box addresses
  {
    type: 'address',
    regex: /\bP\.?\s*O\.?\s*Box\s+\d+\b/gi,
    maskedValue: '[PO BOX REDACTED]',
    description: 'PO Box address'
  },
  // ZIP codes (5 digit or 5+4)
  {
    type: 'zip',
    regex: /\b\d{5}(?:-\d{4})?\b/g,
    maskedValue: (match) => match.length === 5 ? '*****' : '*****-****',
    description: 'ZIP code'
  },
  // Insurance/Policy numbers
  {
    type: 'insurance_id',
    regex: /\b(?:policy|insurance|member|subscriber|group)\s*(?:number|#|no\.?|id)?\s*:?\s*([A-Z0-9]{6,20})\b/gi,
    maskedValue: '[INSURANCE ID REDACTED]',
    description: 'Insurance/Policy number'
  },
  // Credit card numbers (basic pattern)
  {
    type: 'credit_card',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    maskedValue: '****-****-****-****',
    description: 'Credit card number'
  },
  // IP addresses
  {
    type: 'ip_address',
    regex: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    maskedValue: '***.***.***.***',
    description: 'IP address'
  },
  // Driver's license patterns (generic - state-specific patterns vary)
  {
    type: 'drivers_license',
    regex: /\b(?:DL|Driver'?s?\s*License|License)\s*#?\s*:?\s*([A-Z0-9]{5,15})\b/gi,
    maskedValue: '[DL REDACTED]',
    description: "Driver's license number"
  },
  // Account numbers (generic)
  {
    type: 'account_number',
    regex: /\b(?:account|acct)\s*(?:number|#|no\.?)?\s*:?\s*([A-Z0-9]{6,20})\b/gi,
    maskedValue: '[ACCT REDACTED]',
    description: 'Account number'
  }
];

/**
 * Detect PHI (Protected Health Information) in text
 * Uses comprehensive regex patterns for HIPAA-defined identifiers
 */
function detectPHI(text: string): PHIEntity[] {
  const entities: PHIEntity[] = [];
  const processedRanges: Set<string> = new Set();

  for (const pattern of PHI_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.regex.lastIndex = 0;

    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      const rangeKey = `${start}-${end}`;

      // Avoid duplicate detections for overlapping patterns
      if (processedRanges.has(rangeKey)) {
        continue;
      }

      // Check if this range overlaps with any existing entity
      let overlaps = false;
      const rangesArray = Array.from(processedRanges);
      for (let i = 0; i < rangesArray.length; i++) {
        const existingRange = rangesArray[i]!;
        const rangeParts = existingRange.split('-').map(Number);
        const existingStart = rangeParts[0] ?? 0;
        const existingEnd = rangeParts[1] ?? 0;
        if ((start >= existingStart && start < existingEnd) ||
            (end > existingStart && end <= existingEnd) ||
            (start <= existingStart && end >= existingEnd)) {
          overlaps = true;
          break;
        }
      }

      if (overlaps) {
        continue;
      }

      processedRanges.add(rangeKey);

      const maskedValue = typeof pattern.maskedValue === 'function'
        ? pattern.maskedValue(match[0])
        : pattern.maskedValue;

      entities.push({
        type: pattern.type,
        text: match[0],
        start,
        end,
        masked_value: maskedValue
      });

      logger.debug('PHI detected', {
        type: pattern.type,
        description: pattern.description,
        position: { start, end }
      });
    }
  }

  // Sort entities by start position for consistent ordering
  entities.sort((a, b) => a.start - b.start);

  if (entities.length > 0) {
    logger.info('PHI detection completed', {
      totalEntities: entities.length,
      types: Array.from(new Set(entities.map(e => e.type)))
    });
  }

  return entities;
}

/**
 * Patient context for note generation
 */
export interface PatientContext {
  patientName?: string;
  patientAge?: number;
  chiefComplaint?: string;
  relevantHistory?: string;
  providerName?: string;
  appointmentTypeName?: string;
  appointmentTypeCategory?: string;
  specialtyFocus?: string;
}

function resolveOpenAINoteModel(agentConfig?: AgentConfiguration | null): string {
  if (agentConfig?.aiModel && !agentConfig.aiModel.toLowerCase().includes('claude')) {
    return agentConfig.aiModel;
  }
  return getOpenAINoteModel();
}

function resolveAnthropicModel(agentConfig?: AgentConfiguration | null): string {
  if (agentConfig?.aiModel && agentConfig.aiModel.toLowerCase().includes('claude')) {
    return agentConfig.aiModel;
  }
  return getAnthropicNoteModel();
}

type ConversationRole = 'doctor' | 'patient' | 'unknown';

function liveRoleToConversationRole(role?: LiveSpeakerRole): ConversationRole {
  if (role === 'provider') {
    return 'doctor';
  }
  if (role === 'patient') {
    return 'patient';
  }
  return 'unknown';
}

function resolveConversationRole(speaker: string, text?: string, speakerRole?: LiveSpeakerRole): ConversationRole {
  const normalized = speaker.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const explicitRole = liveRoleToConversationRole(speakerRole);
  if (explicitRole !== 'unknown') {
    return explicitRole;
  }

  const inferredRole = text ? liveRoleToConversationRole(inferLiveSpeakerRole(text)) : 'unknown';
  if (!normalized) {
    return inferredRole;
  }

  if (/^(doctor|provider|physician|clinician|dr\.?)(_|$)/.test(normalized)) {
    return 'doctor';
  }

  if (/^(patient|pt|client)(_|$)/.test(normalized)) {
    return 'patient';
  }

  if (/^speaker_?\d+/.test(normalized)) {
    return inferredRole;
  }

  return inferredRole;
}

function splitStatementsByRole(
  segments: TranscriptionSegment[]
): { doctorStatements: string[]; patientStatements: string[] } {
  const doctorStatements: string[] = [];
  const patientStatements: string[] = [];

  for (const segment of segments) {
    const text = toSafeString(segment.text);
    if (!text) continue;

    const role = resolveConversationRole(segment.speaker, text, segment.speakerRole);
    if (role === 'doctor') {
      doctorStatements.push(text);
    } else if (role === 'patient') {
      patientStatements.push(text);
    }
  }

  // Last-resort fallback for unknown speaker labels: alternate turns.
  if (doctorStatements.length === 0 && patientStatements.length === 0) {
    segments.forEach((segment, index) => {
      const text = toSafeString(segment.text);
      if (!text) return;
      if (index % 2 === 0) {
        doctorStatements.push(text);
      } else {
        patientStatements.push(text);
      }
    });
  }

  return { doctorStatements, patientStatements };
}

interface SanitizedOutboundPayload {
  transcriptText: string;
  segments: TranscriptionSegment[];
  maskedEntityCount: number;
  maskedTypes: string[];
}

function safePromptMetadata(prompt: string | undefined): string {
  const value = typeof prompt === 'string' ? prompt : '';
  return `PROMPT_${hashValue(value)}_${value.length}`;
}

function sanitizeTextForOutboundModel(text: string): { text: string; entities: PHIEntity[] } {
  const normalized = toSafeString(text);
  if (!normalized) {
    return { text: '', entities: [] };
  }

  const entities = detectPHI(normalized);
  const maskedText = entities.length > 0 ? maskPHI(normalized, entities) : normalized;
  const deidentified = deidentifyTextForExternalAi(maskedText);
  const additionalEntities = deidentified.entities.map((entity) => ({
    type: entity.type,
    text: entity.hash,
    start: entity.start,
    end: entity.end,
    masked_value: entity.replacement,
  }));

  return {
    text: deidentified.text,
    entities: [...entities, ...additionalEntities],
  };
}

function sanitizePatientContextForOutboundModel(patientContext?: PatientContext): PatientContext | undefined {
  if (!patientContext || isHipaaClinicalAiEnabled()) {
    return patientContext;
  }

  const sanitize = (value?: string) => value ? deidentifyTextForExternalAi(String(redactValue(value))).text : undefined;
  return {
    ...patientContext,
    patientName: undefined,
    providerName: undefined,
    chiefComplaint: sanitize(patientContext.chiefComplaint),
    relevantHistory: sanitize(patientContext.relevantHistory),
  };
}

function sanitizeOutboundPayload(
  transcriptText: string,
  segments: TranscriptionSegment[]
): SanitizedOutboundPayload {
  const maskedTypes = new Set<string>();
  let maskedEntityCount = 0;

  const sanitizedTranscript = sanitizeTextForOutboundModel(transcriptText);
  maskedEntityCount += sanitizedTranscript.entities.length;
  for (const entity of sanitizedTranscript.entities) {
    maskedTypes.add(entity.type);
  }

  const sanitizedSegments = segments.map((segment) => {
    const sanitizedSegment = sanitizeTextForOutboundModel(segment.text);
    maskedEntityCount += sanitizedSegment.entities.length;
    for (const entity of sanitizedSegment.entities) {
      maskedTypes.add(entity.type);
    }

    return {
      ...segment,
      text: sanitizedSegment.text,
    };
  });

  return {
    transcriptText: sanitizedTranscript.text,
    segments: sanitizedSegments,
    maskedEntityCount,
    maskedTypes: Array.from(maskedTypes).sort(),
  };
}

/**
 * Generate clinical note using Claude or OpenAI (or mock if not configured)
 * Now supports custom agent configurations for different visit types
 */
export async function generateClinicalNote(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext,
  options?: AmbientTranscriptionOptions
): Promise<ClinicalNoteGenerationResult> {
  // Use real AI if available
  const anthropicKey = getAnthropicKey();
  const openAIKey = getOpenAIKey();
  const anthropicAllowed = Boolean(anthropicKey && isClinicalAiProviderAllowed('anthropic', anthropicKey));
  const openAIAllowed = Boolean(openAIKey && isClinicalAiProviderAllowed('openai', openAIKey));
  const sanitizedPayload = sanitizeOutboundPayload(transcriptText, segments);
  const safePatientContext = sanitizePatientContextForOutboundModel(patientContext);

  if (anthropicAllowed || openAIAllowed) {
    if (sanitizedPayload.maskedEntityCount > 0) {
      logger.info('Applied PHI masking to outbound ambient AI payload', {
        maskedEntityCount: sanitizedPayload.maskedEntityCount,
        maskedTypes: sanitizedPayload.maskedTypes,
      });
    }

    const orderedProviders = getNoteGenerationProviderOrder();
    const attemptedProviders: NoteGenerationProvider[] = [];
    const providerErrors: Array<{ provider: NoteGenerationProvider; error: string }> = [];

    for (const provider of orderedProviders) {
      if (provider === 'anthropic' && anthropicKey && anthropicAllowed) {
        attemptedProviders.push(provider);
        try {
          return await generateNoteWithClaude(
            sanitizedPayload.transcriptText,
            sanitizedPayload.segments,
            agentConfig,
            safePatientContext,
            anthropicKey
          );
        } catch (error) {
          const safeError = toSafeErrorMessage(error);
          providerErrors.push({ provider, error: safeError });
          logger.warn('Ambient AI note generation provider failed', {
            provider,
            error: safeError,
          });
        }
      }

      if (provider === 'openai' && openAIKey && openAIAllowed) {
        attemptedProviders.push(provider);
        try {
          return await generateNoteWithGPT4(
            sanitizedPayload.transcriptText,
            sanitizedPayload.segments,
            agentConfig,
            safePatientContext,
            openAIKey,
            options
          );
        } catch (error) {
          const safeError = toSafeErrorMessage(error);
          providerErrors.push({ provider, error: safeError });
          logger.warn('Ambient AI note generation provider failed', {
            provider,
            error: safeError,
          });
        }
      }
    }

    if (attemptedProviders.length > 0) {
      logger.warn('AI note generation failed, falling back to mock', {
        attemptedProviders,
        providerErrors,
      });
    }
  }

  if (isSyntheticAmbientRuntime()) {
    return await mockGenerateClinicalNote(transcriptText, segments, agentConfig, patientContext);
  }

  throw unavailableAmbientError(
    anthropicKey && !anthropicAllowed ? 'anthropic' : openAIKey && !openAIAllowed ? 'openai' : 'unknown',
    anthropicKey || openAIKey ? 'NOTE_PROVIDER_NOT_ATTESTED' : 'NOTE_PROVIDER_NOT_CONFIGURED'
  );
}

/**
 * Generate clinical note using Anthropic Claude
 * Uses agent configuration if provided for customized prompts and settings
 */
async function generateNoteWithClaude(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig: AgentConfiguration | null | undefined,
  patientContext: PatientContext | undefined,
  anthropicKey: string
): Promise<ClinicalNoteGenerationResult> {
  const model = resolveAnthropicModel(agentConfig);
  logger.info('Generating clinical note with Claude', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name,
    model
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments, patientContext);

  const safeSystemPrompt = agentConfig?.systemPrompt
    ? `${agentConfig.systemPrompt}\n\n${buildDocumentationRules(patientContext)}`
    : `You are a clinical documentation assistant. Use only current encounter facts and leave unsupported sections empty.\n\n${buildDocumentationRules(patientContext)}`;

  // Use model and settings from config if available
  const temperature = agentConfig?.temperature || 0.3;
  const maxTokens = agentConfig?.maxTokens || 4000;

  // Execute API call with retry logic
  const result = await withRetry(
    async () => {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          temperature: temperature,
          system: safeSystemPrompt,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        throw new AmbientAIError(
          'Anthropic note provider returned an error.',
          {
            statusCode,
            provider: 'anthropic',
            isRetryable: isRetryableError(null, statusCode)
          }
        );
      }

      return response.json() as Promise<any>;
    },
    'Claude note generation',
    DEFAULT_RETRY_CONFIG
  );

  const noteText = result.content[0].text;

  const parsed = parseAIGeneratedNote(noteText, segments, agentConfig, patientContext);
  return {
    ...parsed,
    generationMetadata: {
      provider: 'anthropic',
      model,
      prompt: safePromptMetadata(prompt),
      systemPrompt: safePromptMetadata(safeSystemPrompt),
      agentConfigId: agentConfig?.id || null,
      appointmentTypeName: patientContext?.appointmentTypeName,
      specialtyFocus: patientContext?.specialtyFocus,
    }
  };
}

/**
 * Generate clinical note using OpenAI
 * Uses agent configuration if provided for customized prompts and settings
 */
async function generateNoteWithGPT4(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig: AgentConfiguration | null | undefined,
  patientContext: PatientContext | undefined,
  openAIKey: string,
  options?: AmbientTranscriptionOptions
): Promise<ClinicalNoteGenerationResult> {
  const model = resolveOpenAINoteModel(agentConfig);
  logger.info('Generating clinical note with OpenAI', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name,
    model
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments, patientContext);

  // Use settings from config if available
  const temperature = agentConfig?.temperature || 0.3;
  const maxTokens = agentConfig?.maxTokens || 3000;
  const systemPrompt = agentConfig?.systemPrompt
    ? `${agentConfig.systemPrompt}\n\n${buildDocumentationRules(patientContext)}`
    : `You are an expert dermatology medical scribe. Generate accurate clinical notes using only current encounter facts and leave unsupported sections empty.\n\n${buildDocumentationRules(patientContext)}`;

  // Execute API call with retry logic
  const result = await withRetry(
    async () => {
      const response = await meteredOpenAiFetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIKey}`
        },
        body: JSON.stringify({
          model: model,
          store: false,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        })
      }, {
        feature: 'ambient_note_generation',
        model,
        tenantId: options?.tenantId,
        userId: options?.userId,
        resourceType: options?.resourceType || 'ambient_note',
        resourceId: options?.resourceId,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        throw new AmbientAIError(
          'OpenAI note provider returned an error.',
          {
            statusCode,
            provider: 'openai',
            isRetryable: isRetryableError(null, statusCode)
          }
        );
      }

      return response.json() as Promise<any>;
    },
    'OpenAI note generation',
    DEFAULT_RETRY_CONFIG
  );

  const noteText = result.choices[0].message.content;

  const parsed = parseAIGeneratedNote(noteText, segments, agentConfig, patientContext);
  return {
    ...parsed,
    generationMetadata: {
      provider: 'openai',
      model,
      prompt: safePromptMetadata(prompt),
      systemPrompt: safePromptMetadata(systemPrompt),
      agentConfigId: agentConfig?.id || null,
      appointmentTypeName: patientContext?.appointmentTypeName,
      specialtyFocus: patientContext?.specialtyFocus,
    }
  };
}

/**
 * Build prompt for AI note generation
 */
function buildPromptContextBlock(patientContext?: PatientContext): string {
  if (!patientContext) {
    return '';
  }

  const contextLines = [
    patientContext.patientName ? `- Patient Name: ${patientContext.patientName}` : null,
    patientContext.patientAge !== undefined ? `- Patient Age: ${patientContext.patientAge}` : null,
    patientContext.providerName ? `- Provider: ${patientContext.providerName}` : null,
    patientContext.appointmentTypeName ? `- Visit Type: ${patientContext.appointmentTypeName}` : null,
    patientContext.appointmentTypeCategory ? `- Visit Category: ${patientContext.appointmentTypeCategory}` : null,
    patientContext.specialtyFocus ? `- Specialty Focus: ${patientContext.specialtyFocus}` : null,
    patientContext.chiefComplaint ? `- Known Chief Complaint: ${patientContext.chiefComplaint}` : null,
    patientContext.relevantHistory ? `- Relevant Existing History: ${patientContext.relevantHistory}` : null,
  ].filter((line): line is string => Boolean(line));

  if (contextLines.length === 0) {
    return '';
  }

  return `PATIENT/VISIT CONTEXT:\n${contextLines.join('\n')}`;
}

function buildDocumentationRules(patientContext?: PatientContext): string {
  const rules = [
    '- Only document facts supported by the transcript or supplied visit context.',
    '- The current transcript is the source of truth for today\'s chief complaint and diagnoses; do not import unrelated chronic problems or appointment labels into the note unless they are discussed.',
    '- If a section is missing material information, return an empty string (never invent content or use a generic normal statement).',
    '- Do not create a normal review of systems or normal physical exam for systems that were not actually discussed.',
    '- Omit small talk, scheduling, billing, administrative, and other nonclinical conversation.',
    '- Never invent a diagnosis, medication, order, procedure, consent, code, or follow-up. Templates, style, visit labels, and defaults affect wording/structure only and are not clinical evidence.',
    '- Distinguish clearly between patient-reported symptoms, provider-observed findings, and diagnostic impression.',
    '- For dermatology exam content, preserve lesion morphology, color, distribution, location, size, scale, crust, pigment change, and symptom descriptors when stated.',
    '- For procedures, only document consent, site, preparation, anesthesia, specimen handling, wound care, and follow-up instructions if they are actually supported by the transcript/context.',
    '- Keep the assessment and plan clinically specific and actionable, without padding or generic filler.',
    '- Suggested ICD-10 and CPT codes must be grounded in the documented visit type and findings.',
    '- Separate diagnostic tests from treatments/procedures/instructions. Cryotherapy, wound care, sunscreen, and medications are not diagnostic tests.',
    '- Use current biopsy CPT defaults: 11102 for one tangential/shave biopsy lesion. Do not use retired CPT 11100.',
    '- For a rough/gritty/scaly sun-exposed cheek or face lesion treated with liquid nitrogen, consider actinic keratosis (L57.0) when supported.',
    '- For a darker/changing/irregular pigmented lesion being biopsied, use D48.5 as melanoma rule-out/neoplasm of uncertain behavior until pathology confirms the final diagnosis.',
  ];

  const specialty = `${patientContext?.specialtyFocus || ''} ${patientContext?.appointmentTypeCategory || ''}`.toLowerCase();
  if (specialty.includes('cosmetic')) {
    rules.push('- For cosmetic/self-pay visits, do not invent a medical diagnosis solely to satisfy billing. Focus on goals, counseling, candidacy, risks, consent, and treatment planning.');
  }

  if (specialty.includes('mohs')) {
    rules.push('- For Mohs or surgical visits, prioritize stage-specific findings, measurements, reconstruction details, pathology correlation, and postoperative instructions.');
  }

  return `DOCUMENTATION RULES:\n${rules.join('\n')}`;
}

function buildClinicalNotePrompt(
  transcriptText: string,
  segments: TranscriptionSegment[],
  patientContext?: PatientContext
): string {
  const { patientStatements, doctorStatements } = splitStatementsByRole(segments);
  const contextBlock = buildPromptContextBlock(patientContext);
  const documentationRules = buildDocumentationRules(patientContext);

  return `You are an expert dermatology medical scribe. Generate a problem-oriented SOAP clinical note from the following patient-provider conversation transcript, including only clinically relevant content supported by this current encounter.

CONVERSATION TRANSCRIPT:
${transcriptText}

PATIENT STATEMENTS:
${patientStatements.join(' ')}

PROVIDER STATEMENTS:
${doctorStatements.join(' ')}

${contextBlock ? `${contextBlock}\n\n` : ''}${documentationRules}

Please generate a structured clinical note in the following JSON format:

{
  "chiefComplaint": "Brief chief complaint statement",
  "hpi": "History of Present Illness using only stated facts; empty string if unsupported",
  "ros": "Only explicitly discussed review-of-systems findings; empty string if unsupported",
  "physicalExam": "Only explicitly documented dermatologic findings; empty string if unsupported",
  "assessment": "Problem-oriented assessment only when supported; empty string if unsupported",
  "plan": "Only the discussed treatment, education, procedure, or follow-up plan; empty string if unsupported",
  "sectionReview": {
    "chiefComplaint": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] },
    "hpi": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] },
    "ros": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] },
    "physicalExam": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] },
    "assessment": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] },
    "plan": { "status": "drafted|not_documented", "confidence": 0.0, "evidence": [{ "source": "transcript|visit_context", "excerpt": "exact source excerpt" }] }
  },
  "notDocumentedSections": [],
  "suggestedIcd10": [{"code": "X00.0", "description": "Diagnosis name", "confidence": 0.95}],
  "suggestedCpt": [{"code": "99213", "description": "E/M code", "confidence": 0.90}],
  "medications": [{"name": "Drug name", "dosage": "Strength/form", "frequency": "Schedule", "confidence": 0.92}],
  "allergies": [{"allergen": "Substance", "reaction": "Reaction type", "confidence": 0.98}],
  "followUpTasks": [{"task": "Task description", "priority": "high/medium/low", "dueDate": "YYYY-MM-DD", "confidence": 0.90}],
  "sectionConfidence": {
    "chiefComplaint": 0.95,
    "hpi": 0.90,
    "ros": 0.85,
    "physicalExam": 0.92,
    "assessment": 0.88,
    "plan": 0.90
  },
  "differentialDiagnoses": [
    {
      "condition": "Name of condition",
      "confidence": 0.0-1.0,
      "reasoning": "Brief clinical reasoning for this diagnosis",
      "icd10Code": "Suggested ICD-10 code"
    }
  ],
  "recommendedTests": [
    {
      "testName": "Name of test/procedure",
      "rationale": "Why recommended based on conversation",
      "urgency": "routine" | "soon" | "urgent",
      "cptCode": "Suggested CPT code if applicable"
    }
  ],
  "patientSummary": {
    "whatWeDiscussed": "Simple description of what was discussed during the visit",
    "yourConcerns": ["List of symptoms/concerns the patient mentioned"],
    "diagnosis": "Patient-friendly explanation of the diagnosis (if diagnosis made)",
    "treatmentPlan": "What to do next in simple, patient-friendly terms",
    "followUp": "When to return for follow-up"
  }
}

REQUIREMENTS:
- Use proper medical terminology for dermatology
- Include specific dermatologic descriptors (e.g., erythematous, macular, papular, etc.)
- Extract all mentioned medications with dosing
- Identify all allergies mentioned
- Suggest appropriate ICD-10 and CPT codes
- Create follow-up tasks based on provider instructions
- Provide confidence scores and exact source evidence for each section
- Be concise; omit unsupported sections rather than padding them
- Keep unsupported assumptions out of the note
- Do not invent or change the patient name; use the patient context name when provided, otherwise use "the patient"
- If the transcript does not support a complete ROS, exam, diagnosis, or code suggestion, return an empty string or empty list as appropriate

DIFFERENTIAL_DIAGNOSES (array of 0-5 possible conditions):
- Rank by confidence level based on clinical presentation
- Provide clear clinical reasoning for each differential
- Include appropriate ICD-10 codes for billing consideration
- Consider common dermatologic conditions and mimickers
- Return an empty array when the current encounter does not support a differential

RECOMMENDED_TESTS (array of relevant tests):
- Base recommendations on clinical findings and differentials
- Specify urgency level appropriate to presentation
- Include CPT codes where applicable for billing
- Consider cost-effectiveness and clinical necessity
- Do not list cryotherapy, wound care, sunscreen, or prescriptions as tests
- If shave/tangential biopsy and pathology are discussed, list that biopsy/pathology workflow with CPT 11102 rather than generic "Histopathology" alone or CPT 11100

PATIENT_SUMMARY (patient-friendly language):
- Use simple, non-technical terms a patient can understand
- Clearly list only active symptoms or concerns the patient reported or the clinician observed
- Do not list denied symptoms or wound-care warning symptoms as current concerns
- Explain the diagnosis in plain language if one was made
- Provide actionable treatment steps in everyday language
- Clearly state when they need to come back

Return ONLY the JSON object, no additional text.`;
}

/**
 * Build prompt using agent configuration
 * Supports configurable sections, terminology, and output format
 */
function buildConfigurablePrompt(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig: AgentConfiguration,
  patientContext?: PatientContext
): string {
  const { patientStatements, doctorStatements } = splitStatementsByRole(segments);

  // Get configured sections
  const sections = agentConfig.noteSections || ['chiefComplaint', 'hpi', 'ros', 'physicalExam', 'assessment', 'plan'];
  const sectionPrompts = agentConfig.sectionPrompts || {};

  // Build section instructions
  let sectionInstructions = '';
  for (const section of sections) {
    const sectionPrompt = sectionPrompts[section] || `Generate appropriate content for ${section}`;
    sectionInstructions += `\n- ${section}: ${sectionPrompt}`;
  }

  // Build terminology guidance if available
  let terminologyGuidance = '';
  if (agentConfig.terminologySet && Object.keys(agentConfig.terminologySet).length > 0) {
    terminologyGuidance = '\n\nUSE THESE TERMINOLOGY SETS:\n';
    for (const [category, terms] of Object.entries(agentConfig.terminologySet)) {
      terminologyGuidance += `- ${category}: ${(terms as string[]).join(', ')}\n`;
    }
  }

  // Build focus areas guidance
  let focusAreasGuidance = '';
  if (agentConfig.focusAreas && agentConfig.focusAreas.length > 0) {
    focusAreasGuidance = `\n\nFOCUS AREAS FOR THIS VISIT TYPE:\n${agentConfig.focusAreas.join(', ')}`;
  }

  // Build default codes if available
  let defaultCodesGuidance = '';
  if (agentConfig.defaultCptCodes && agentConfig.defaultCptCodes.length > 0) {
    defaultCodesGuidance += '\n\nCOMMON CPT CODES FOR THIS VISIT TYPE:\n';
    for (const code of agentConfig.defaultCptCodes) {
      defaultCodesGuidance += `- ${code.code}: ${code.description}\n`;
    }
  }
  if (agentConfig.defaultIcd10Codes && agentConfig.defaultIcd10Codes.length > 0) {
    defaultCodesGuidance += '\nCOMMON ICD-10 CODES FOR THIS VISIT TYPE:\n';
    for (const code of agentConfig.defaultIcd10Codes) {
      defaultCodesGuidance += `- ${code.code}: ${code.description}\n`;
    }
  }

  // Use the agent's prompt template with variable substitution
  let prompt = agentConfig.promptTemplate;

  // Replace template variables
  prompt = prompt.replace(/\{\{transcript\}\}/g, transcriptText);
  prompt = prompt.replace(/\{\{patientName\}\}/g, patientContext?.patientName || 'Patient');
  prompt = prompt.replace(/\{\{patientAge\}\}/g, patientContext?.patientAge?.toString() || 'Unknown');
  prompt = prompt.replace(/\{\{chiefComplaint\}\}/g, patientContext?.chiefComplaint || 'See transcript');
  prompt = prompt.replace(/\{\{relevantHistory\}\}/g, patientContext?.relevantHistory || 'See transcript');
  prompt = prompt.replace(/\{\{providerName\}\}/g, patientContext?.providerName || 'Treating clinician');
  prompt = prompt.replace(/\{\{appointmentTypeName\}\}/g, patientContext?.appointmentTypeName || 'Unspecified visit');
  prompt = prompt.replace(/\{\{appointmentTypeCategory\}\}/g, patientContext?.appointmentTypeCategory || 'Unspecified category');
  prompt = prompt.replace(/\{\{specialtyFocus\}\}/g, patientContext?.specialtyFocus || agentConfig.specialtyFocus || 'general');
  prompt = prompt.replace(/\{\{sections\}\}/g, sections.join(', '));

  // Build expected output JSON schema based on configured sections
  const outputSchema: Record<string, string> = {};
  for (const section of sections) {
    outputSchema[section] = `Content for ${section}`;
  }

  // Add standard extraction fields
  const fullSchema = {
    ...outputSchema,
    sectionReview: Object.fromEntries(AMBIENT_NOTE_SECTIONS.map((section) => [section, {
      status: 'drafted|not_documented',
      confidence: 0.0,
      evidence: [{ source: 'transcript|visit_context', excerpt: 'exact source excerpt' }],
    }])),
    notDocumentedSections: AMBIENT_NOTE_SECTIONS,
    overallConfidence: 0.90,
    sectionConfidence: Object.fromEntries(sections.map(s => [s, 0.90])),
    suggestedIcd10: [{ code: 'X00.0', description: 'Diagnosis', confidence: 0.90 }],
    suggestedCpt: [{ code: '99213', description: 'E/M code', confidence: 0.90 }],
    medications: [{ name: 'Medication', dosage: 'Dosage', frequency: 'Frequency', confidence: 0.90 }],
    allergies: [{ allergen: 'Allergen', reaction: 'Reaction', confidence: 0.90 }],
    followUpTasks: [{ task: 'Task', priority: 'medium', dueDate: '2024-01-01', confidence: 0.90 }],
    differentialDiagnoses: [{ condition: 'Condition', confidence: 0.90, reasoning: 'Reasoning', icd10Code: 'X00.0' }],
    recommendedTests: [{ testName: 'Test', rationale: 'Rationale', urgency: 'routine', cptCode: '00000' }],
    patientSummary: {
      whatWeDiscussed: 'Discussion summary',
      yourConcerns: ['Concern 1'],
      diagnosis: 'Diagnosis explanation',
      treatmentPlan: 'Treatment plan',
      followUp: 'Follow-up timing'
    }
  };

  // Append additional context
  const contextBlock = buildPromptContextBlock(patientContext);
  const documentationRules = buildDocumentationRules({
    ...patientContext,
    specialtyFocus: patientContext?.specialtyFocus || agentConfig.specialtyFocus,
  });

  prompt += `
${contextBlock ? `\n${contextBlock}\n` : ''}
${terminologyGuidance}
${focusAreasGuidance}
${defaultCodesGuidance}

SECTION REQUIREMENTS:${sectionInstructions}

${documentationRules}

OUTPUT FORMAT: ${agentConfig.outputFormat || 'soap'}
VERBOSITY LEVEL: ${agentConfig.verbosityLevel || 'standard'}
INCLUDE BILLING CODES: ${agentConfig.includeCodes !== false ? 'Yes' : 'No'}

IDENTITY AND SUMMARY RULES:
- Do not invent or change the patient name; use the patient context name when provided, otherwise use "the patient".
- In patientSummary.yourConcerns, include only active symptoms or concerns the patient reported or the clinician observed.
- Do not list denied symptoms or wound-care warning symptoms as current concerns.
- Use only current transcript/visit-context facts. Omit small talk, scheduling, billing, and administrative conversation.
- Never invent normal ROS/exam, diagnoses, medications, orders, procedures, consent, codes, or follow-up. Return empty strings for unsupported standard sections.
- Templates, provider style, visit labels, terminology, focus areas, and defaults affect wording/structure only; they cannot add clinical facts.

Please return a JSON object with this structure:
${JSON.stringify(fullSchema, null, 2)}

IMPORTANT: Return ONLY valid JSON, no additional text or markdown formatting.`;

  return prompt;
}

const SYMPTOM_PATTERN_LIBRARY: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Rash', pattern: /\brash|eruption|lesion/ },
  { label: 'Changing mole / pigmented lesion', pattern: /\b(changing mole|mole[^.]{0,80}chang|chang[^.]{0,80}mole|pigmented lesion|darker mole|irregular mole)\b/ },
  { label: 'Rough / gritty sun-damage spot', pattern: /\b(rough spot|gritty|sandpaper|scaly patch|flaky patch|actinic keratosis)\b/ },
  { label: 'Itching', pattern: /\bitch|pruritus/ },
  { label: 'Pain', pattern: /\bpain|hurt|tender/ },
  { label: 'Burning', pattern: /\bburn|stinging/ },
  { label: 'Redness', pattern: /\bred|erythema/ },
  { label: 'Swelling', pattern: /\bswell|edema/ },
  { label: 'Scaling', pattern: /\bscal(e|y)|flak/ },
  { label: 'Bleeding', pattern: /\bbleed|bleeding|bled/ },
  { label: 'Crusting / scabbing', pattern: /\bcrust|scab/ },
  { label: 'Blistering', pattern: /\bblister|vesicle|bulla/ },
  { label: 'Drainage', pattern: /\bdrain|ooz|discharge/ },
  { label: 'Fever', pattern: /\bfever|febrile/ },
];

const NEGATED_OR_HISTORY_SYMPTOM_CONTEXT =
  /\b(denies?|denied|no|not|without|doesn'?t|does not|didn'?t|did not|isn'?t|is not|family history|personal history|history of|father|mother|parent|sibling|in the past|previously|prior)\b/;

const SAFETY_NET_SYMPTOM_CONTEXT =
  /\b(call|return|watch for|seek care|come back sooner|follow up sooner|if you (notice|develop|have)|if it (starts|gets|becomes)|warning signs|wound care|after (the )?(biopsy|procedure))\b/;

function splitClinicalSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isNegatedOrSafetyNetSymptomSentence(sentence: string): boolean {
  const normalized = sentence.toLowerCase();
  const symptomWord = /\b(pain|hurt|tender|sore|itch|bleed|bled|crust|scab|drain|ooz|pus|discharge|fever|blister|rash|redness|swelling)\b/;

  if (NEGATED_OR_HISTORY_SYMPTOM_CONTEXT.test(normalized) && symptomWord.test(normalized)) {
    return true;
  }

  if (SAFETY_NET_SYMPTOM_CONTEXT.test(normalized) && symptomWord.test(normalized)) {
    return true;
  }

  if (/\b(any|do you have|have you had)\b.{0,55}\b(fever|pain|drainage|bleeding|itch|rash|pus|redness)\b\??/i.test(normalized)) {
    return true;
  }

  return false;
}

function hasCurrentClinicalEvidence(sentences: string[], pattern: RegExp): boolean {
  return sentences.some((sentence) => pattern.test(sentence) && !isNegatedOrSafetyNetSymptomSentence(sentence));
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeConfidence(value: unknown, fallback = 0.5): number {
  let numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) {
    numeric = fallback;
  }
  if (numeric > 1 && numeric <= 100) {
    numeric /= 100;
  }
  if (numeric > 100) {
    numeric = fallback;
  }
  return Math.max(0.01, Math.min(0.99, numeric));
}

function normalizeUrgency(value: unknown): 'routine' | 'soon' | 'urgent' {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === 'urgent' || normalized === 'soon' || normalized === 'routine') {
    return normalized;
  }
  return 'routine';
}

function normalizeConcerns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const concerns: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = toSafeString(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    concerns.push(text);
  }

  return concerns.slice(0, 8);
}

function extractSymptomsFromContent(
  chiefComplaint: string,
  hpi: string,
  transcriptText: string,
  existingConcerns: string[]
): string[] {
  const symptoms: string[] = [];
  const seen = new Set<string>();
  const sourceText = `${chiefComplaint} ${hpi} ${transcriptText}`.trim();
  const normalizedSource = sourceText.toLowerCase();
  const sentences = splitClinicalSentences(sourceText);

  const pushUnique = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    symptoms.push(trimmed);
  };

  const hasCurrentEvidence = (pattern: RegExp) => hasCurrentClinicalEvidence(sentences, pattern);
  const hasLesionContext =
    /\b(mole|nevus|pigmented lesion|skin lesion|papule|neoplasm|melanoma|biopsy)\b/.test(normalizedSource);
  const hasScalpDermContext =
    /\b(scalp|seborrheic|dandruff|ketoconazole|shampoo|hairline)\b/.test(normalizedSource);

  if (hasCurrentEvidence(/\b(changing mole|mole[^.]*changed|changed[^.]*mole|pigmented lesion|dark brown papule|irregular border|multiple shades|asymmetric|suspicious lesion)\b/i)) {
    pushUnique('Changing mole / pigmented lesion');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(growing|growth|larger|bigger|increased size|darker|changed color|color change|multiple shades)\b/i)) {
    pushUnique('Growth or color change');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(bleed|bleeding|bled)\b/i)) {
    pushUnique('Bleeding');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(crust|crusted|scab)\b/i)) {
    pushUnique('Crusting / scabbing');
  }

  if (hasLesionContext && hasCurrentEvidence(/\b(catches|catching|caught|clothing|shirt|scratch|scratched|irritated)\b/i)) {
    pushUnique('Irritated/catching lesion');
  }

  if (hasScalpDermContext && hasCurrentEvidence(/\b(itch|pruritus|scale|scaly|flak|dandruff|redness|erythema|seborrheic|ketoconazole|shampoo)\b/i)) {
    pushUnique('Scalp itching/flaking');
  }

  const normalizeConcern = (rawConcern: string): string | null => {
    const concern = rawConcern.trim();
    if (!concern) return null;

    const normalizedConcern = concern.toLowerCase();
    if (isNegatedOrSafetyNetSymptomSentence(concern)) {
      return null;
    }
    if (/\b(pain|hurt|tender)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(pain|hurt|tender|sore)\b/i)) {
      return null;
    }
    if (/\b(drain|ooz|pus|discharge)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(drain|ooz|pus|discharge)\b/i)) {
      return null;
    }
    if (/\b(fever|febrile)\b/.test(normalizedConcern) && !hasCurrentEvidence(/\b(fever|febrile)\b/i)) {
      return null;
    }
    if (/\bbleed|bled/.test(normalizedConcern) && hasLesionContext) {
      return 'Bleeding';
    }
    if (/\bcrust|scab/.test(normalizedConcern) && hasLesionContext) {
      return 'Crusting / scabbing';
    }
    if (/\b(changing|growth|larger|bigger|darker|color|mole|pigmented lesion|lesion)\b/.test(normalizedConcern) && hasLesionContext) {
      return 'Changing mole / pigmented lesion';
    }
    if (/\bitch|scale|scal|flak|redness|dandruff|rash/.test(normalizedConcern) && hasScalpDermContext) {
      return 'Scalp itching/flaking';
    }
    if (normalizedConcern === 'rash' && (hasLesionContext || hasScalpDermContext)) {
      return null;
    }

    return concern;
  };

  for (const concern of existingConcerns) {
    const normalizedConcern = normalizeConcern(concern);
    if (normalizedConcern) {
      pushUnique(normalizedConcern);
    }
  }

  for (const pattern of SYMPTOM_PATTERN_LIBRARY) {
    if (!hasCurrentEvidence(pattern.pattern)) {
      continue;
    }
    if (pattern.label === 'Rash' && (hasLesionContext || hasScalpDermContext)) {
      continue;
    }
    if (['Itching', 'Redness', 'Scaling'].includes(pattern.label) && hasScalpDermContext) {
      continue;
    }
    if (['Bleeding', 'Crusting / scabbing'].includes(pattern.label) && hasLesionContext) {
      continue;
    }
    if (pattern.label === 'Drainage' && !hasCurrentEvidence(/\b(drain|ooz|pus|discharge)\b/i)) {
      continue;
    }

    if (pattern.pattern.test(normalizedSource)) {
      pushUnique(pattern.label);
    }
  }

  if (symptoms.length === 0) {
    const fallback = chiefComplaint || hpi || 'Skin symptoms discussed during visit';
    pushUnique(fallback.split('.')[0] || fallback);
  }

  return symptoms.slice(0, 8);
}

function normalizeDueDate(value: unknown): string | undefined {
  const dueDate = toSafeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return undefined;
  }

  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (parsed < todayUtc) {
    return undefined;
  }

  return dueDate;
}

function shouldKeepFollowUpTask(task: string, clinicalContext: string): boolean {
  const normalizedTask = task.toLowerCase();
  const normalizedContext = clinicalContext.toLowerCase();
  const systemicContext =
    /\b(biologic|humira|skyrizi|cosentyx|dupixent|taltz|tremfya|enbrel|systemic|isotretinoin|accutane|methotrexate|cyclosporine|acitretin)\b/.test(normalizedContext);
  const labContext = systemicContext || /\b(lab|labs|cbc|cmp|lipid|hepatic|lft|pregnancy test|tb|hepatitis)\b/.test(normalizedContext);

  if (/\bprior authorization\b.*\bbiologic\b|\bbiologic\b.*\bprior authorization\b/.test(normalizedTask) && !systemicContext) {
    return false;
  }

  if (/\bsystemic medications?\b|\bbiologic prescribed\b/.test(normalizedTask) && !systemicContext) {
    return false;
  }

  if (/\blab follow-up\b|\breview systemic labs\b/.test(normalizedTask) && !labContext) {
    return false;
  }

  return true;
}

function shouldApplyTaskTemplate(task: string, clinicalContext: string): boolean {
  const normalizedTask = task.toLowerCase();
  const normalizedContext = clinicalContext.toLowerCase();

  if (!shouldKeepFollowUpTask(task, clinicalContext)) {
    return false;
  }

  if (/\b(biopsy|pathology|specimen|suture|wound)\b/.test(normalizedTask)
    && !/\b(biopsy|pathology|specimen|shave|punch|excision|closure|suture|wound)\b/.test(normalizedContext)) {
    return false;
  }

  return true;
}

function normalizeFollowUpTasks(
  raw: unknown,
  clinicalContext = ''
): Array<{ task: string; priority: string; dueDate?: string; confidence: number }> {
  if (!Array.isArray(raw)) {
    return [];
  }

  const tasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const task = toSafeString(candidate.task);
    if (!task) continue;
    if (!shouldKeepFollowUpTask(task, clinicalContext)) continue;
    tasks.push({
      task,
      priority: toSafeString(candidate.priority) || 'medium',
      dueDate: normalizeDueDate(candidate.dueDate),
      confidence: normalizeConfidence(candidate.confidence, 0.8),
    });
  }
  return tasks.slice(0, 8);
}

function normalizeDifferentialDiagnoses(
  raw: unknown,
  transcriptText: string
): DifferentialDiagnosis[] {
  const normalized: DifferentialDiagnosis[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Record<string, unknown>;
      const condition = toSafeString(candidate.condition);
      if (!condition) continue;
      const key = condition.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push({
        condition,
        confidence: normalizeConfidence(candidate.confidence, 0.5),
        reasoning: toSafeString(candidate.reasoning) || 'Based on documented symptom and exam pattern.',
        icd10Code: toSafeString(candidate.icd10Code) || 'R21'
      });
    }
  }

  const fallback = generateDifferentialDiagnoses(transcriptText);
  for (const diagnosis of fallback) {
    if (normalized.length >= 5) break;
    const key = diagnosis.condition.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(diagnosis);
  }

  if (normalized.length === 0) {
    return fallback.slice(0, 3);
  }

  let weighted = normalized
    .slice(0, 5)
    .map((item, index) => ({
      ...item,
      confidence: item.confidence > 0 ? item.confidence : Math.max(0.05, 0.6 - (index * 0.1)),
    }));

  const total = weighted.reduce((sum, item) => sum + item.confidence, 0);
  if (total > 0) {
    weighted = weighted.map((item) => ({
      ...item,
      confidence: Number((item.confidence / total).toFixed(4)),
    }));
  }

  weighted.sort((a, b) => b.confidence - a.confidence);
  return weighted;
}

function normalizeRecommendedTests(raw: unknown, transcriptText: string): RecommendedTest[] {
  const tests: RecommendedTest[] = [];
  const seen = new Set<string>();
  const transcript = transcriptText.toLowerCase();

  const addTest = (test: RecommendedTest) => {
    const normalizedName = normalizeTestName(test.testName, transcript);
    if (!normalizedName) {
      return;
    }
    const normalizedTest: RecommendedTest = {
      ...test,
      testName: normalizedName,
      cptCode: normalizeTestCpt(test.cptCode, normalizedName, transcript),
    };
    const key = normalizedTest.testName.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    tests.push(normalizedTest);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Record<string, unknown>;
      const testName = toSafeString(candidate.testName);
      if (!testName) continue;
      addTest({
        testName,
        rationale: toSafeString(candidate.rationale) || 'Suggested by documented presentation and differential.',
        urgency: normalizeUrgency(candidate.urgency),
        cptCode: toSafeString(candidate.cptCode) || undefined
      });
    }
  }

  for (const fallbackTest of generateRecommendedTests(transcriptText)) {
    if (tests.length >= 5) {
      break;
    }
    addTest(fallbackTest);
  }

  return tests.slice(0, 5);
}

function normalizeTestName(testName: string, transcript: string): string {
  const normalized = testName.trim();
  const hasBiopsyContext = /\b(shave|tangential|biopsy|pathology|dermatopathology|histopathology)\b/.test(transcript);

  if (hasBiopsyContext && /\b(histopathology|pathology review|skin biopsy|biopsy)\b/i.test(normalized)) {
    return /\b(shave|tangential)\b/.test(transcript)
      ? 'Shave/tangential biopsy with dermatopathology'
      : 'Skin biopsy with dermatopathology';
  }

  if (/\b(cryotherapy|liquid nitrogen|LN2|wound care|sunscreen|sun protection|shampoo|medication|prescription)\b/i.test(normalized)) {
    return '';
  }

  return normalized;
}

function normalizeTestCpt(cptCode: string | undefined, testName: string, transcript: string): string | undefined {
  const normalizedCode = cptCode === '11100' ? '11102' : cptCode;
  if (/\b(shave|tangential)\b/.test(transcript) && /\bbiopsy\b/i.test(testName)) {
    return '11102';
  }
  return normalizedCode;
}

function normalizeSectionConfidence(raw: unknown): ClinicalNote['sectionConfidence'] {
  const defaults: ClinicalNote['sectionConfidence'] = {
    chiefComplaint: 0.85,
    hpi: 0.85,
    ros: 0.80,
    physicalExam: 0.85,
    assessment: 0.85,
    plan: 0.85
  };

  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const source = raw as Record<string, unknown>;
  return {
    chiefComplaint: normalizeConfidence(source.chiefComplaint, defaults.chiefComplaint),
    hpi: normalizeConfidence(source.hpi, defaults.hpi),
    ros: normalizeConfidence(source.ros, defaults.ros),
    physicalExam: normalizeConfidence(source.physicalExam, defaults.physicalExam),
    assessment: normalizeConfidence(source.assessment, defaults.assessment),
    plan: normalizeConfidence(source.plan, defaults.plan)
  };
}

const AMBIENT_NOTE_SECTIONS: AmbientNoteSection[] = [
  'chiefComplaint',
  'hpi',
  'ros',
  'physicalExam',
  'assessment',
  'plan',
];

function normalizeEvidenceForComparison(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeDocumentedSection(value: unknown): string {
  const content = toSafeString(value);
  if (!content || /^(not documented|not available|n\/a|none)$/i.test(content)) {
    return '';
  }
  return content;
}

function ambientSectionSources(
  transcriptText: string,
  patientContext?: PatientContext,
): Array<{ source: AmbientEvidenceSource; text: string }> {
  const sources: Array<{ source: AmbientEvidenceSource; text: string }> = [];
  if (toSafeString(transcriptText)) {
    sources.push({ source: 'transcript', text: toSafeString(transcriptText) });
  }
  const contextText = [patientContext?.chiefComplaint, patientContext?.relevantHistory]
    .map(toSafeString)
    .filter(Boolean)
    .join(' ');
  if (contextText) {
    sources.push({ source: 'visit_context', text: contextText });
  }
  return sources;
}

function validateAmbientEvidence(
  rawEvidence: unknown,
  sources: Array<{ source: AmbientEvidenceSource; text: string }>,
): AmbientSectionEvidence[] {
  if (!Array.isArray(rawEvidence)) {
    return [];
  }

  const validated: AmbientSectionEvidence[] = [];
  const seen = new Set<string>();
  for (const item of rawEvidence) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const source = candidate.source;
    if (source !== 'transcript' && source !== 'visit_context') continue;
    const excerpt = toSafeString(candidate.excerpt);
    if (!excerpt) continue;

    const normalizedExcerpt = normalizeEvidenceForComparison(excerpt);
    const matchingSource = sources.find((entry) =>
      entry.source === source
      && normalizeEvidenceForComparison(entry.text).includes(normalizedExcerpt));
    if (!matchingSource) continue;

    const key = `${source}:${normalizedExcerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validated.push({ source, excerpt: excerpt.slice(0, 1200) });
  }

  return validated.slice(0, 8);
}

function findDerivedAmbientEvidence(
  content: string,
  sources: Array<{ source: AmbientEvidenceSource; text: string }>,
): AmbientSectionEvidence[] {
  const normalizedContent = normalizeEvidenceForComparison(content);
  if (!normalizedContent) return [];

  for (const source of sources) {
    const sourceSentences = splitClinicalSentences(source.text);
    for (const sentence of sourceSentences) {
      const normalizedSentence = normalizeEvidenceForComparison(sentence);
      if (!normalizedSentence) continue;
      if (normalizedContent.includes(normalizedSentence) || normalizedSentence.includes(normalizedContent)) {
        // Avoid treating one-word labels as proof of a full generated section.
        if (normalizedSentence.length < 4 || normalizedContent.length < 4) continue;
        return [{ source: source.source, excerpt: sentence.slice(0, 1200) }];
      }
    }
  }
  return [];
}

function normalizeAmbientSectionReview(
  rawReview: unknown,
  sections: Record<AmbientNoteSection, string>,
  rawSectionConfidence: ClinicalNote['sectionConfidence'],
  sources: Array<{ source: AmbientEvidenceSource; text: string }>,
): AmbientSectionReviewMap {
  const reviewObject = rawReview && typeof rawReview === 'object'
    ? rawReview as Record<string, unknown>
    : {};
  const normalized = {} as AmbientSectionReviewMap;

  for (const section of AMBIENT_NOTE_SECTIONS) {
    const content = normalizeDocumentedSection(sections[section]);
    const candidate = reviewObject[section] && typeof reviewObject[section] === 'object'
      ? reviewObject[section] as Record<string, unknown>
      : {};
    const evidence = validateAmbientEvidence(candidate.evidence, sources);
    const derivedEvidence = evidence.length === 0 && content
      ? findDerivedAmbientEvidence(content, sources)
      : [];
    const validatedEvidence = evidence.length > 0 ? evidence : derivedEvidence;
    let confidence = content
      ? normalizeConfidence(candidate.confidence, rawSectionConfidence[section] || 0.5)
      : 0;

    // Keep generated text available for clinician review, but make the lack of
    // source evidence explicit so callers never treat it as a safe auto-fill.
    if (content && validatedEvidence.length === 0) {
      confidence = Math.min(confidence, 0.5);
    }

    normalized[section] = {
      status: content ? 'drafted' : 'not_documented',
      confidence,
      evidence: validatedEvidence,
    };
  }

  return normalized;
}

function removeUnsupportedContextTopics(text: string, transcriptText: string): string {
  let normalized = text.trim();
  const transcript = transcriptText.toLowerCase();

  if (!transcript.includes('psoriasis')) {
    normalized = normalized
      .replace(/\bpsoriasis follow-up and\s+/gi, '')
      .replace(/\bfollow-up on psoriasis and\s+/gi, '')
      .replace(/\bpsoriasis medication follow-up and\s+/gi, '')
      .replace(/\bpsoriasis follow-up\b\.?/gi, '')
      .replace(/\bpsoriasis\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .trim();
  }

  if (!normalized) {
    return text.trim();
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizePatientSummary(
  raw: unknown,
  context: {
    chiefComplaint: string;
    hpi: string;
    transcriptText: string;
    plan: string;
    differentialDiagnoses: DifferentialDiagnosis[];
    followUpTasks: Array<{ task: string; priority: string; dueDate?: string; confidence: number }>;
  }
): PatientSummary {
  const source = raw && typeof raw === 'object'
    ? (raw as Record<string, unknown>)
    : {};

  const providedConcerns = normalizeConcerns(source.yourConcerns);
  const symptoms = extractSymptomsFromContent(
    context.chiefComplaint,
    context.hpi,
    context.transcriptText,
    providedConcerns
  );
  const topDiagnosis = context.differentialDiagnoses[0];

  const whatWeDiscussed = toSafeString(source.whatWeDiscussed)
    || context.chiefComplaint
    || context.hpi
    || 'No clinical discussion documented.';

  const treatmentPlan = toSafeString(source.treatmentPlan)
    || (context.plan
      ? context.plan.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' ')
      : 'No treatment plan documented.');

  const dueDate = context.followUpTasks.find((task) => task.dueDate)?.dueDate;
  const followUp = toSafeString(source.followUp)
    || (dueDate ? `Follow up by ${dueDate}.` : 'No follow-up documented.');

  return {
    whatWeDiscussed,
    yourConcerns: symptoms,
    diagnosis: toSafeString(source.diagnosis) || (topDiagnosis
      ? `${topDiagnosis.condition} (${Math.round(topDiagnosis.confidence * 100)}% likelihood)`
      : undefined),
    treatmentPlan,
    followUp
  };
}

function normalizeAssessmentText(
  raw: unknown,
  differentialDiagnoses: DifferentialDiagnosis[]
): string {
  const provided = toSafeString(raw);
  if (provided && !/^not documented$/i.test(provided)) {
    return provided;
  }

  if (differentialDiagnoses.length === 0) {
    return '';
  }

  return differentialDiagnoses
    .slice(0, 3)
    .map((diagnosis, index) => {
      const title = `${index + 1}. ${diagnosis.condition}${diagnosis.icd10Code ? ` (${diagnosis.icd10Code})` : ''}`;
      const reasoning = diagnosis.reasoning ? `\n   - ${diagnosis.reasoning}` : '';
      return `${title}${reasoning}`;
    })
    .join('\n');
}

/**
 * Parse AI-generated note text into structured format
 * Handles custom sections from agent configuration
 */
function parseAIGeneratedNote(
  noteText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext,
): ClinicalNote & ExtractedData {
  try {
    // Try to parse as JSON - strip any markdown code blocks if present
    let cleanedText = noteText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    const parsed = JSON.parse(cleanedText);
    const transcriptText = segments.map((segment) => segment.text).join(' ');
    const normalizedSectionConfidence = normalizeSectionConfidence(parsed.sectionConfidence);
    const sources = ambientSectionSources(transcriptText, patientContext);
    const clinicalContext = [
      transcriptText,
      toSafeString(parsed.chiefComplaint),
      toSafeString(parsed.hpi),
      toSafeString(parsed.assessment),
      toSafeString(parsed.plan),
    ].join(' ');
    const followUpTasks = normalizeFollowUpTasks(parsed.followUpTasks, clinicalContext);
    const differentialDiagnoses = normalizeDifferentialDiagnoses(parsed.differentialDiagnoses, transcriptText);
    const recommendedTests = normalizeRecommendedTests(parsed.recommendedTests, transcriptText);
    const chiefComplaint = removeUnsupportedContextTopics(normalizeDocumentedSection(parsed.chiefComplaint), transcriptText);
    const hpi = removeUnsupportedContextTopics(normalizeDocumentedSection(parsed.hpi), transcriptText);
    const assessment = normalizeAssessmentText(normalizeDocumentedSection(parsed.assessment), differentialDiagnoses);
    const sectionValues: Record<AmbientNoteSection, string> = {
      chiefComplaint,
      hpi,
      ros: normalizeDocumentedSection(parsed.ros),
      physicalExam: normalizeDocumentedSection(parsed.physicalExam),
      assessment,
      plan: normalizeDocumentedSection(parsed.plan),
    };
    const sectionReview = normalizeAmbientSectionReview(
      parsed.sectionReview,
      sectionValues,
      normalizedSectionConfidence,
      sources,
    );
    const effectiveSectionConfidence = Object.fromEntries(
      AMBIENT_NOTE_SECTIONS.map((section) => [section, sectionReview[section].confidence]),
    ) as ClinicalNote['sectionConfidence'];
    const notDocumentedSections = AMBIENT_NOTE_SECTIONS.filter(
      (section) => sectionReview[section].status === 'not_documented',
    );
    const patientSummary = normalizePatientSummary(parsed.patientSummary, {
      chiefComplaint,
      hpi,
      transcriptText,
      plan: toSafeString(parsed.plan),
      differentialDiagnoses,
      followUpTasks
    });

    // Calculate overall confidence
    const sectionScores = Object.values(effectiveSectionConfidence);
    const overallConfidence = sectionScores.length > 0
      ? sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length
      : 0.85;

    // Build base note with standard sections (backward compatible)
    const note: ClinicalNote & ExtractedData = {
      chiefComplaint,
      hpi,
      ros: sectionValues.ros,
      physicalExam: sectionValues.physicalExam,
      assessment,
      plan: sectionValues.plan,
      overallConfidence: overallConfidence,
      sectionConfidence: effectiveSectionConfidence,
      sectionReview,
      notDocumentedSections,
      suggestedIcd10: parsed.suggestedIcd10 || [],
      suggestedCpt: parsed.suggestedCpt || [],
      medications: parsed.medications || [],
      allergies: parsed.allergies || [],
      followUpTasks,
      differentialDiagnoses,
      recommendedTests,
      patientSummary
    };

    // If agent config has custom sections, include those as well
    if (agentConfig?.noteSections) {
      for (const section of agentConfig.noteSections) {
        if (parsed[section] && !(section in note)) {
          (note as any)[section] = parsed[section];
        }
      }
    }

    // Add follow-up interval from config if not in parsed output
    if (agentConfig?.defaultFollowUpInterval && note.followUpTasks.length === 0) {
      const followUpTask = {
        task: `Schedule follow-up in ${agentConfig.defaultFollowUpInterval}`,
        priority: 'medium',
        dueDate: calculateDueDate(agentConfig.defaultFollowUpInterval),
        confidence: 0.80
      };
      note.followUpTasks.push(followUpTask);
    }

    // Add task templates from config
    if (agentConfig?.taskTemplates && agentConfig.taskTemplates.length > 0) {
      for (const template of agentConfig.taskTemplates) {
        if (!shouldApplyTaskTemplate(template.task, clinicalContext)) {
          continue;
        }

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (template.daysFromVisit || 7));

        note.followUpTasks.push({
          task: template.task,
          priority: template.priority,
          dueDate: dueDate.toISOString().split('T')[0],
          confidence: 0.85
        });
      }
    }

    return note;
  } catch (error) {
    logger.warn('Failed to parse AI note, using fallback', {
      error: toSafeErrorMessage(error),
    });
    if (isSyntheticAmbientRuntime()) {
      return mockGenerateClinicalNoteSync(segments, agentConfig, patientContext);
    }
    throw unavailableAmbientError('unknown', 'NOTE_RESPONSE_INVALID');
  }
}

/**
 * Calculate due date from interval string like "4-6 weeks" or "2 weeks"
 */
function calculateDueDate(interval: string): string {
  const dueDate = new Date();
  const match = interval.match(/(\d+)(?:-(\d+))?\s*(day|week|month)s?/i);

  if (match && match[1] && match[3]) {
    // Use the lower bound of the range
    const amount = parseInt(match[1], 10);
    const unit = match[3].toLowerCase();

    switch (unit) {
      case 'day':
        dueDate.setDate(dueDate.getDate() + amount);
        break;
      case 'week':
        dueDate.setDate(dueDate.getDate() + (amount * 7));
        break;
      case 'month':
        dueDate.setMonth(dueDate.getMonth() + amount);
        break;
    }
  } else {
    // Default to 2 weeks if can't parse
    dueDate.setDate(dueDate.getDate() + 14);
  }

  return dueDate.toISOString().split('T')[0]!;
}

/**
 * Mock note generation fallback
 */
async function mockGenerateClinicalNote(
  transcriptText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext
): Promise<ClinicalNoteGenerationResult> {
  const hasConfiguredProvider = Boolean(getAnthropicKey() || getOpenAIKey());
  logger.info(
    hasConfiguredProvider
      ? 'Using mock note generation after provider failure'
      : 'Using mock note generation (no API key configured)'
  );

  // Simulate AI processing delay
  const delayMs = resolveMockDelayMs(3000 + Math.random() * 2000);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return mockGenerateClinicalNoteSync(segments, agentConfig, patientContext);
}

/**
 * Synchronous mock note generation
 */
function mockGenerateClinicalNoteSync(
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null,
  patientContext?: PatientContext
): ClinicalNoteGenerationResult {
  // Extract patient statements vs doctor observations
  const { patientStatements, doctorStatements } = splitStatementsByRole(segments);
  const transcriptText = segments.map(s => toSafeString(s.text)).filter(Boolean).join(' ');

  // The mock is deliberately source-bound. It is used by demos and tests, but
  // must not teach the application that a normal ROS, physical exam, diagnosis,
  // medication, or follow-up can be safely fabricated from a template.
  const chiefComplaint = sourceBoundMockChiefComplaint(patientStatements, patientContext);
  const hpi = sourceBoundMockHpi(patientStatements, patientContext);
  const ros = '';
  const physicalExam = sourceBoundMockExam(doctorStatements);
  const assessment = sourceBoundMockAssessment(doctorStatements);
  const plan = sourceBoundMockPlan(doctorStatements);
  const sectionValues: Record<AmbientNoteSection, string> = {
    chiefComplaint,
    hpi,
    ros,
    physicalExam,
    assessment,
    plan,
  };
  const sources = ambientSectionSources(transcriptText, patientContext);
  const sectionReview = normalizeAmbientSectionReview(
    undefined,
    sectionValues,
    {
      chiefComplaint: 0.8,
      hpi: 0.8,
      ros: 0,
      physicalExam: 0.7,
      assessment: 0.6,
      plan: 0.7,
    },
    sources,
  );
  const effectiveSectionConfidence = Object.fromEntries(
    AMBIENT_NOTE_SECTIONS.map((section) => [section, sectionReview[section].confidence]),
  ) as ClinicalNote['sectionConfidence'];
  const notDocumentedSections = AMBIENT_NOTE_SECTIONS.filter(
    (section) => sectionReview[section].status === 'not_documented',
  );

  const note: ClinicalNote = {
    chiefComplaint,
    hpi,
    ros,
    physicalExam,
    assessment,
    plan,
    overallConfidence: Object.values(effectiveSectionConfidence).reduce((sum, value) => sum + value, 0)
      / AMBIENT_NOTE_SECTIONS.length,
    sectionConfidence: effectiveSectionConfidence,
    sectionReview,
    notDocumentedSections,
    differentialDiagnoses: generateDifferentialDiagnoses(transcriptText),
    recommendedTests: generateRecommendedTests(transcriptText),
    patientSummary: generateSourceBoundPatientSummary(patientStatements, doctorStatements, sectionValues),
  };

  // Extract structured data
  const extracted: ExtractedData = {
    suggestedIcd10: extractICD10Codes(transcriptText),
    suggestedCpt: extractCPTCodes(transcriptText),
    medications: extractMedications(doctorStatements),
    allergies: extractAllergies(transcriptText),
    followUpTasks: extractFollowUpTasks(doctorStatements)
  };

  return {
    ...note,
    ...extracted,
    generationMetadata: {
      provider: 'mock',
      model: agentConfig?.aiModel || 'mock-dermatology-scribe',
      prompt: safePromptMetadata(agentConfig
        ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
        : buildClinicalNotePrompt(transcriptText, segments, patientContext)),
      systemPrompt: agentConfig?.systemPrompt ? safePromptMetadata(agentConfig.systemPrompt) : undefined,
      agentConfigId: agentConfig?.id || null,
      appointmentTypeName: patientContext?.appointmentTypeName,
      specialtyFocus: patientContext?.specialtyFocus,
    }
  };
}

function sourceBoundMockChiefComplaint(
  patientStatements: string[],
  patientContext?: PatientContext,
): string {
  const contextComplaint = normalizeDocumentedSection(patientContext?.chiefComplaint);
  if (contextComplaint) return contextComplaint;

  const clinicalStatement = patientStatements.find((statement) =>
    /\b(rash|lesion|mole|spot|itch|pruritus|pain|scal|flak|acne|skin|bump|growth|red|bleed|burn)\b/i.test(statement)
    && !/\b(schedule|appointment|insurance|billing|paperwork|phone|address)\b/i.test(statement));
  return clinicalStatement || '';
}

function sourceBoundMockHpi(
  patientStatements: string[],
  patientContext?: PatientContext,
): string {
  const statements = patientStatements.filter((statement) =>
    !/\b(schedule|appointment|insurance|billing|paperwork|phone|address)\b/i.test(statement));
  if (statements.length > 0) return statements.join(' ');
  return normalizeDocumentedSection(patientContext?.chiefComplaint);
}

function sourceBoundMockExam(doctorStatements: string[]): string {
  return doctorStatements
    .flatMap((statement) => splitClinicalSentences(statement))
    .filter((sentence) =>
      /\b(exam|examination|observed|shows?|noted|visualiz|papule|plaque|macule|patch|lesion|rash|erythematous|scaly|scale|tender|morphology|location|size)\b/i.test(sentence)
      && !/\b(what brings|do you have|any pain|any drainage|any fever)\b/i.test(sentence))
    .join(' ');
}

function sourceBoundMockAssessment(doctorStatements: string[]): string {
  return doctorStatements
    .flatMap((statement) => splitClinicalSentences(statement))
    .filter((sentence) => /\b(assessment|diagnos|impression|consistent with|likely)\b/i.test(sentence))
    .join(' ');
}

function sourceBoundMockPlan(doctorStatements: string[]): string {
  return doctorStatements
    .flatMap((statement) => splitClinicalSentences(statement))
    .filter((sentence) =>
      /\b(start|stop|continue|apply|use|take|prescrib|treat|biopsy|cryotherap|freeze|return|follow.?up|call|avoid|counsel|discuss|plan)\b/i.test(sentence)
      && !/^what brings you in/i.test(sentence))
    .join(' ');
}

function generateSourceBoundPatientSummary(
  patientStatements: string[],
  doctorStatements: string[],
  sections: Record<AmbientNoteSection, string>,
): PatientSummary {
  const concern = sections.chiefComplaint || sections.hpi || '';
  const discussion = [sections.chiefComplaint, sections.hpi, sections.physicalExam]
    .filter(Boolean)
    .join(' ')
    .trim();
  const concerns = patientStatements
    .filter((statement) => /\b(rash|lesion|mole|spot|itch|pruritus|pain|scal|flak|acne|skin|bump|growth|red|bleed|burn)\b/i.test(statement))
    .slice(0, 8);
  const plan = sections.plan || '';
  const followUp = splitClinicalSentences(plan)
    .filter((sentence) => /\b(return|follow.?up|call|recheck|come back)\b/i.test(sentence))
    .join(' ');

  return {
    whatWeDiscussed: discussion || concern || 'No clinical discussion documented.',
    yourConcerns: concerns.length > 0 ? concerns : concern ? [concern] : [],
    diagnosis: sections.assessment || undefined,
    treatmentPlan: plan || 'No treatment plan documented.',
    followUp: followUp || 'No follow-up documented.',
  };
}

function extractICD10Codes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  const codes: Array<{ code: string; description: string; confidence: number }> = [];
  const text = transcript.toLowerCase();

  // These are suggestions only and are returned when the diagnosis is stated
  // in the source. Do not infer a diagnosis from a generic symptom such as a
  // rash or an exposure alone.
  if (text.includes('contact dermatitis')) {
    codes.push({ code: 'L23.9', description: 'Allergic contact dermatitis, unspecified cause', confidence: 0.94 });
  }

  if (text.includes('pruritus')) {
    codes.push({ code: 'L29.9', description: 'Pruritus, unspecified', confidence: 0.88 });
  }

  return codes;
}

function extractCPTCodes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  // An E/M level cannot be established from a transcript. Return a procedure
  // suggestion only when the procedure is explicitly named.
  if (/\b(shave|tangential) biopsy\b/i.test(transcript)) {
    return [{ code: '11102', description: 'Tangential biopsy of skin, single lesion', confidence: 0.8 }];
  }
  return [];
}

function extractMedications(doctorStatements: string[]): Array<{ name: string; dosage: string; frequency: string; confidence: number }> {
  const meds: Array<{ name: string; dosage: string; frequency: string; confidence: number }> = [];
  const text = doctorStatements.join(' ');

  if (/\btriamcinolone\b/i.test(text)) {
    meds.push({ name: 'Triamcinolone', dosage: '', frequency: '', confidence: 0.8 });
  }

  if (/\bantihistamine\b/i.test(text) || /\bcetirizine\b/i.test(text)) {
    meds.push({ name: /\bcetirizine\b/i.test(text) ? 'Cetirizine' : 'Antihistamine', dosage: '', frequency: '', confidence: 0.8 });
  }

  return meds;
}

function extractAllergies(transcript: string): Array<{ allergen: string; reaction: string; confidence: number }> {
  const allergies: Array<{ allergen: string; reaction: string; confidence: number }> = [];
  const match = transcript.match(/\bpenicillin\b(?:[^.]{0,80}\b(hives?|rash|anaphylaxis|reaction)\b)?/i);

  if (match) {
    allergies.push({ allergen: 'Penicillin', reaction: match[1] || '', confidence: 0.8 });
  }

  return allergies;
}

function extractFollowUpTasks(doctorStatements: string[]): Array<{ task: string; priority: string; dueDate?: string; confidence: number }> {
  return doctorStatements
    .flatMap((statement) => splitClinicalSentences(statement))
    .filter((sentence) => /\b(follow.?up|return|call|recheck|come back)\b/i.test(sentence))
    .slice(0, 8)
    .map((task) => ({
      task,
      priority: /\b(urgent|immediately|today)\b/i.test(task) ? 'high' : 'medium',
      confidence: 0.8,
    }));
}

function generateDifferentialDiagnoses(transcript: string): DifferentialDiagnosis[] {
  const text = transcript.toLowerCase();
  const differentials: DifferentialDiagnosis[] = [];
  const hasActinicKeratosisContext =
    /\b(actinic keratosis|rough spot|gritty|sandpaper|scaly patch|flaky patch)\b/.test(text)
    && /\b(cheek|face|temple|forehead|scalp|ear|sun|liquid nitrogen|cryotherapy|freeze|frozen|ln2)\b/.test(text);
  const addActinicKeratosis = () => {
    if (differentials.some((item) => item.icd10Code === 'L57.0')) {
      return;
    }
    differentials.push({
      condition: 'Actinic keratosis',
      confidence: 0.86,
      reasoning: 'Rough, scaly or gritty lesion on a sun-exposed site with cryotherapy discussion supports actinic keratosis.',
      icd10Code: 'L57.0'
    });
  };

  if (hasActinicKeratosisContext) {
    addActinicKeratosis();
  }

  if (
    text.includes('changing mole') ||
    text.includes('mole changing') ||
    /\bmole\b.{0,80}\bchang/.test(text) ||
    (/\b(dark|black|irregular|asymmetric|variegated|bleeding)\b/.test(text) && /\b(mole|lesion|spot|growth)\b/.test(text))
  ) {
    differentials.push({
      condition: 'Suspicious pigmented lesion / melanoma rule-out',
      confidence: 0.88,
      reasoning: 'Changing, dark, irregular, asymmetric, or bleeding pigmented lesion features require biopsy/pathology consideration.',
      icd10Code: 'D48.5'
    });
    differentials.push({
      condition: 'Atypical melanocytic nevus',
      confidence: 0.64,
      reasoning: 'Pigmented lesion with atypical features may represent dysplastic nevus; pathology is needed for distinction.',
      icd10Code: 'D22.9'
    });
    if (/\b(stuck on|waxy|verrucous|seborrheic keratosis|crumbly)\b/.test(text)) {
      differentials.push({
        condition: 'Seborrheic keratosis, inflamed or atypical',
        confidence: 0.34,
        reasoning: 'Can mimic concerning pigmented lesions clinically, especially if irritated, waxy, or stuck-on.',
        icd10Code: 'L82.0'
      });
    }
    return differentials.slice(0, 5);
  }

  if (text.includes('acne') || text.includes('isotretinoin') || text.includes('accutane') || text.includes('cyst') || text.includes('scarring')) {
    differentials.push({
      condition: 'Acne vulgaris',
      confidence: 0.9,
      reasoning: 'Deep painful cysts, facial/chest involvement, and scarring are consistent with moderate to severe acne.',
      icd10Code: 'L70.0'
    });
    differentials.push({
      condition: 'Acne conglobata / nodulocystic acne',
      confidence: 0.58,
      reasoning: 'Painful cysts and scarring raise concern for a nodulocystic acne phenotype.',
      icd10Code: 'L70.1'
    });
    differentials.push({
      condition: 'Folliculitis',
      confidence: 0.28,
      reasoning: 'Can mimic acneiform papules/pustules, though cysts and scarring favor acne.',
      icd10Code: 'L73.9'
    });
    return differentials;
  }

  if (text.includes('psoriasis') || text.includes('scaly plaques') || text.includes('silvery scale') || text.includes('biologic')) {
    differentials.push({
      condition: 'Psoriasis',
      confidence: 0.89,
      reasoning: 'Thick scaly plaques on classic sites such as scalp, elbows, or knees are consistent with psoriasis.',
      icd10Code: 'L40.9'
    });
    if (text.includes('joint pain') || text.includes('joint stiffness') || text.includes('stiffness')) {
      differentials.push({
        condition: 'Psoriatic arthritis consideration',
        confidence: 0.62,
        reasoning: 'Joint stiffness or pain in a patient with psoriasis warrants screening for psoriatic arthritis.',
        icd10Code: 'L40.50'
      });
    }
    differentials.push({
      condition: 'Seborrheic dermatitis',
      confidence: 0.33,
      reasoning: 'Scalp scale can overlap with seborrheic dermatitis, though plaque morphology favors psoriasis.',
      icd10Code: 'L21.9'
    });
    return differentials;
  }

  // Primary diagnosis based on conversation context
  if (text.includes('contact dermatitis') || text.includes('detergent') || text.includes('new laundry')) {
    differentials.push({
      condition: 'Allergic contact dermatitis',
      confidence: 0.92,
      reasoning: 'Symmetric erythematous rash on bilateral forearms with temporal relationship to new laundry detergent exposure. Classic presentation of Type IV hypersensitivity reaction.',
      icd10Code: 'L23.9'
    });

    // Secondary differentials
    differentials.push({
      condition: 'Irritant contact dermatitis',
      confidence: 0.75,
      reasoning: 'Similar presentation to allergic contact dermatitis but typically less pruritic. Could be chemical irritation rather than true allergy.',
      icd10Code: 'L24.9'
    });

    differentials.push({
      condition: 'Atopic dermatitis exacerbation',
      confidence: 0.65,
      reasoning: 'Pruritic eczematous rash with stress as aggravating factor. However, acute onset and clear trigger favor contact dermatitis.',
      icd10Code: 'L20.9'
    });

    differentials.push({
      condition: 'Dermatophytosis (tinea corporis)',
      confidence: 0.45,
      reasoning: 'Less likely given bilateral symmetric presentation and clear exposure history. Fungal infection would typically have raised borders and central clearing.',
      icd10Code: 'B35.4'
    });
  } else if (text.includes('rash')) {
    // Generic rash differentials
    differentials.push({
      condition: 'Contact dermatitis, unspecified',
      confidence: 0.85,
      reasoning: 'Pruritic rash presentation consistent with inflammatory dermatitis.',
      icd10Code: 'L25.9'
    });

    differentials.push({
      condition: 'Dermatitis, unspecified',
      confidence: 0.75,
      reasoning: 'Non-specific inflammatory skin condition requiring further evaluation.',
      icd10Code: 'L30.9'
    });

    differentials.push({
      condition: 'Pruritus, unspecified',
      confidence: 0.70,
      reasoning: 'Primary symptom is itching with visible skin changes.',
      icd10Code: 'L29.9'
    });
  }

  return differentials;
}

function generateRecommendedTests(transcript: string): RecommendedTest[] {
  const text = transcript.toLowerCase();
  const tests: RecommendedTest[] = [];

  if (
    text.includes('changing mole') ||
    text.includes('mole changing') ||
    /\bmole\b.{0,80}\bchang/.test(text) ||
    (/\b(dark|black|irregular|asymmetric|variegated|bleeding)\b/.test(text) && /\b(mole|lesion|spot|growth)\b/.test(text))
  ) {
    tests.push({
      testName: /\b(shave|tangential)\b/.test(text)
        ? 'Shave/tangential biopsy with dermatopathology'
        : 'Skin biopsy with dermatopathology',
      rationale: 'Changing, irregular, bleeding, or dark pigmented lesion requires tissue diagnosis when clinically appropriate.',
      urgency: 'urgent',
      cptCode: '11102'
    });
    tests.push({
      testName: 'Dermoscopy / lesion photography',
      rationale: 'Document morphology and support lesion triage before biopsy/pathology correlation.',
      urgency: 'soon',
      cptCode: '96904'
    });
    tests.push({
      testName: 'Pathology review',
      rationale: 'Required after biopsy to confirm diagnosis and guide treatment.',
      urgency: 'urgent'
    });
    return tests;
  }

  if (text.includes('isotretinoin') || text.includes('accutane')) {
    tests.push({
      testName: 'Lipid panel',
      rationale: 'Common baseline or monitoring lab when isotretinoin is being considered.',
      urgency: 'routine'
    });
    tests.push({
      testName: 'Hepatic function panel',
      rationale: 'Often checked before and during isotretinoin therapy.',
      urgency: 'routine'
    });
    tests.push({
      testName: 'Pregnancy test if applicable',
      rationale: 'Required before isotretinoin initiation when applicable.',
      urgency: 'urgent'
    });
    return tests;
  }

  if (text.includes('biologic') || text.includes('humira') || text.includes('skyrizi') || text.includes('cosentyx') || text.includes('taltz') || text.includes('tremfya')) {
    tests.push({
      testName: 'CBC / CMP baseline labs',
      rationale: 'Baseline safety review before systemic or biologic therapy.',
      urgency: 'routine'
    });
    tests.push({
      testName: 'TB screening and hepatitis panel',
      rationale: 'Common infection risk screening before biologic therapy.',
      urgency: 'soon'
    });
    if (text.includes('joint pain') || text.includes('joint stiffness') || text.includes('stiffness')) {
      tests.push({
        testName: 'ESR / CRP',
        rationale: 'Consider inflammatory markers when joint symptoms suggest possible psoriatic arthritis.',
        urgency: 'routine'
      });
    }
    return tests;
  }

  if (text.includes('contact dermatitis') || text.includes('rash')) {
    // For contact dermatitis case
    if (text.includes('recurrent') || text.includes('patch test')) {
      tests.push({
        testName: 'Patch testing (TRUE Test or expanded panel)',
        rationale: 'Comprehensive allergen identification for recurrent or persistent contact dermatitis. Helps identify specific allergens beyond suspected detergent.',
        urgency: 'routine',
        cptCode: '95044'
      });
    }

    // Consider if not improving
    if (text.includes('not better') || text.includes('worse') || text.includes('spreading')) {
      tests.push({
        testName: 'Skin biopsy with histopathology',
        rationale: 'Rule out other inflammatory conditions if rash does not respond to standard treatment or has atypical features.',
        urgency: 'soon',
        cptCode: '11102'
      });

      tests.push({
        testName: 'Potassium hydroxide (KOH) preparation',
        rationale: 'Rule out superficial fungal infection if clinical response to corticosteroids is poor.',
        urgency: 'soon',
        cptCode: '87220'
      });
    }

    // Baseline assessment
    tests.push({
      testName: 'Photography for medical record',
      rationale: 'Document baseline appearance for comparison at follow-up visit to assess treatment response.',
      urgency: 'routine',
      cptCode: '96904'
    });
  }

  // Add routine tests if indicated by other conversation elements
  if (text.includes('infection') || text.includes('fever')) {
    tests.push({
      testName: 'Bacterial culture and sensitivity',
      rationale: 'Rule out secondary bacterial infection if signs of impetiginization are present.',
      urgency: 'soon',
      cptCode: '87070'
    });
  }

  return tests;
}

function generatePatientSummary(patientStatements: string[], doctorStatements: string[]): PatientSummary {
  // Extract patient concerns
  const concerns: string[] = [];
  const patientText = patientStatements.join(' ').toLowerCase();

  if (patientText.includes('rash')) concerns.push('Rash on both arms');
  if (patientText.includes('itchy') || patientText.includes('itch')) concerns.push('Severe itching');
  if (patientText.includes('worse at night')) concerns.push('Symptoms getting worse at night');
  if (patientText.includes('scaly') || patientText.includes('red')) concerns.push('Red, scaly appearance of skin');

  // Ensure at least one concern
  if (concerns.length === 0) {
    concerns.push('Skin problem on arms');
  }

  const summary: PatientSummary = {
    whatWeDiscussed: 'We talked about the rash on your arms that started about 2 weeks ago. You mentioned it began after using a new laundry detergent and has been very itchy, especially at night.',
    yourConcerns: concerns,
    diagnosis: 'You have allergic contact dermatitis, which is an allergic skin reaction to something that touched your skin. In your case, it appears to be caused by the new laundry detergent you started using. This is a common condition and should improve once you stop using the product that caused it.',
    treatmentPlan: 'Stop using the new laundry detergent right away and go back to your old one. I prescribed a prescription-strength steroid cream (triamcinolone) to apply twice daily to the rash for 2 weeks, and an allergy pill (cetirizine) to take at bedtime to help with itching. Use gentle soaps, take warm (not hot) showers, and apply a fragrance-free moisturizer twice daily. Try not to scratch the rash even though it itches.',
    followUp: 'Come back to see me in 3 weeks so we can check how the rash is healing. If the rash isn\'t better in 1 week or if it gets worse, call the office right away.'
  };

  return summary;
}

/**
 * Mask PHI in text using detected entities
 */
export function maskPHI(text: string, phiEntities: PHIEntity[]): string {
  if (phiEntities.length === 0) return text;

  let maskedText = text;
  // Sort entities by start position (descending) to replace from end to start
  const sorted = [...phiEntities].sort((a, b) => b.start - a.start);

  for (const entity of sorted) {
    maskedText = maskedText.substring(0, entity.start) +
                 entity.masked_value +
                 maskedText.substring(entity.end);
  }

  return maskedText;
}
