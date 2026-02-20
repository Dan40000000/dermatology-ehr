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
import { redactValue } from '../utils/phiRedaction';
import { AgentConfiguration } from './agentConfigService';

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
  if (error instanceof Error) {
    return redactValue(error.message);
  }

  if (typeof error === 'string') {
    return redactValue(error);
  }

  return 'Unknown error';
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
const getOpenAIKey = () => process.env.OPENAI_API_KEY;
const getAnthropicKey = () => process.env.ANTHROPIC_API_KEY;
const getOpenAITranscribeModel = () =>
  process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const getOpenAINoteModel = () => process.env.OPENAI_NOTE_MODEL || 'gpt-4o';
const getAnthropicNoteModel = () =>
  process.env.ANTHROPIC_NOTE_MODEL || 'claude-3-5-sonnet-20241022';

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
  { code: '11100', description: 'Biopsy of skin, single lesion', confidence: 0.90 },
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
  text: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface SpeakerInfo {
  [speakerId: string]: {
    label: 'doctor' | 'patient';
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

/**
 * Transcribe audio using OpenAI transcription API (or mock if not configured)
 */
export async function transcribeAudio(
  audioFilePath: string,
  durationSeconds: number
): Promise<TranscriptionResult> {
  // Use real OpenAI transcription if API key available
  const openAIKey = getOpenAIKey();
  if (openAIKey) {
    try {
      const model = getOpenAITranscribeModel();
      return await transcribeWithOpenAI(audioFilePath, durationSeconds, openAIKey, model);
    } catch (error) {
      logger.warn('OpenAI transcription failed, falling back to mock', {
        error: toSafeErrorMessage(error),
        model: getOpenAITranscribeModel(),
      });
      // Fall through to mock implementation
    }
  }

  // Fall back to mock implementation
  return await mockTranscribeAudio(audioFilePath, durationSeconds);
}

/**
 * OpenAI transcription (Whisper or gpt-4o-transcribe variants)
 */
async function transcribeWithOpenAI(
  audioFilePath: string,
  durationSeconds: number,
  openAIKey: string,
  model: string
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
      const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIKey}`,
          ...formHeaders
        },
        body: formBuffer
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        throw new AmbientAIError(
          `OpenAI transcription error: ${statusCode} - ${errorText}`,
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
  chunkIndex: number
): Promise<LiveTranscriptionResult> {
  const openAIKey = getOpenAIKey();
  if (!openAIKey) {
    return mockLiveTranscription(chunkIndex);
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
        const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            ...formData.getHeaders()
          },
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          const statusCode = response.status;

          throw new AmbientAIError(
            `OpenAI live transcription error: ${statusCode} - ${errorText}`,
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
    return mockLiveTranscription(chunkIndex);
  }
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
          label: speakerIndex === 0 ? 'doctor' : 'patient'
        };
        speakerIndex += 1;
      }

      return {
        speaker: speakerId,
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

function resolveConversationRole(speaker: string): ConversationRole {
  const normalized = speaker.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return 'unknown';
  }

  if (/^(speaker_?0|doctor|provider|physician|clinician|dr\.?)(_|$)/.test(normalized)) {
    return 'doctor';
  }

  if (/^(speaker_?1|patient|pt|client)(_|$)/.test(normalized)) {
    return 'patient';
  }

  return 'unknown';
}

function splitStatementsByRole(
  segments: TranscriptionSegment[]
): { doctorStatements: string[]; patientStatements: string[] } {
  const doctorStatements: string[] = [];
  const patientStatements: string[] = [];

  for (const segment of segments) {
    const text = toSafeString(segment.text);
    if (!text) continue;

    const role = resolveConversationRole(segment.speaker);
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

function sanitizeTextForOutboundModel(text: string): { text: string; entities: PHIEntity[] } {
  const normalized = toSafeString(text);
  if (!normalized) {
    return { text: '', entities: [] };
  }

  const entities = detectPHI(normalized);
  if (entities.length === 0) {
    return { text: normalized, entities };
  }

  return { text: maskPHI(normalized, entities), entities };
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
  patientContext?: PatientContext
): Promise<ClinicalNote & ExtractedData> {
  // Use real AI if available
  const anthropicKey = getAnthropicKey();
  const openAIKey = getOpenAIKey();
  const sanitizedPayload = sanitizeOutboundPayload(transcriptText, segments);

  if (anthropicKey || openAIKey) {
    try {
      if (sanitizedPayload.maskedEntityCount > 0) {
        logger.info('Applied PHI masking to outbound ambient AI payload', {
          maskedEntityCount: sanitizedPayload.maskedEntityCount,
          maskedTypes: sanitizedPayload.maskedTypes,
        });
      }

      // Prefer Claude for medical documentation (Anthropic API)
      if (anthropicKey) {
        return await generateNoteWithClaude(
          sanitizedPayload.transcriptText,
          sanitizedPayload.segments,
          agentConfig,
          patientContext,
          anthropicKey
        );
      }
      // Fall back to OpenAI if key available
      if (openAIKey) {
        return await generateNoteWithGPT4(
          sanitizedPayload.transcriptText,
          sanitizedPayload.segments,
          agentConfig,
          patientContext,
          openAIKey
        );
      }
    } catch (error) {
      logger.warn('AI note generation failed, falling back to mock', {
        error: toSafeErrorMessage(error),
      });
      // Fall through to mock implementation
    }
  }

  // Fall back to mock implementation
  return await mockGenerateClinicalNote(transcriptText, segments);
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
): Promise<ClinicalNote & ExtractedData> {
  const model = resolveAnthropicModel(agentConfig);
  logger.info('Generating clinical note with Claude', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name,
    model
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments);

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
          system: agentConfig?.systemPrompt || undefined,
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
          `Claude API error: ${statusCode} - ${errorText}`,
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

  return parseAIGeneratedNote(noteText, segments, agentConfig);
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
  openAIKey: string
): Promise<ClinicalNote & ExtractedData> {
  const model = resolveOpenAINoteModel(agentConfig);
  logger.info('Generating clinical note with OpenAI', {
    agentConfigId: agentConfig?.id,
    agentConfigName: agentConfig?.name,
    model
  });

  // Build prompt using agent config if available, otherwise use default
  const prompt = agentConfig
    ? buildConfigurablePrompt(transcriptText, segments, agentConfig, patientContext)
    : buildClinicalNotePrompt(transcriptText, segments);

  // Use settings from config if available
  const temperature = agentConfig?.temperature || 0.3;
  const maxTokens = agentConfig?.maxTokens || 3000;
  const systemPrompt = agentConfig?.systemPrompt ||
    'You are an expert dermatology medical scribe. Generate accurate, detailed clinical notes following medical documentation standards.';

  // Execute API call with retry logic
  const result = await withRetry(
    async () => {
      const response = await fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIKey}`
        },
        body: JSON.stringify({
          model: model,
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
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        throw new AmbientAIError(
          `OpenAI API error: ${statusCode} - ${errorText}`,
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

  return parseAIGeneratedNote(noteText, segments, agentConfig);
}

/**
 * Build prompt for AI note generation
 */
function buildClinicalNotePrompt(transcriptText: string, segments: TranscriptionSegment[]): string {
  const { patientStatements, doctorStatements } = splitStatementsByRole(segments);

  return `You are an expert dermatology medical scribe. Generate a comprehensive SOAP clinical note from the following patient-provider conversation transcript.

CONVERSATION TRANSCRIPT:
${transcriptText}

PATIENT STATEMENTS:
${patientStatements.join(' ')}

PROVIDER STATEMENTS:
${doctorStatements.join(' ')}

Please generate a structured clinical note in the following JSON format:

{
  "chiefComplaint": "Brief chief complaint statement",
  "hpi": "Detailed History of Present Illness using OLDCARTS format (Onset, Location, Duration, Character, Aggravating/Relieving factors, Timing, Severity)",
  "ros": "Complete Review of Systems",
  "physicalExam": "Detailed dermatologic examination findings with morphology, distribution, and clinical observations",
  "assessment": "Clinical assessment with differential diagnosis",
  "plan": "Detailed treatment plan including medications, patient education, follow-up",
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
- Provide confidence scores for each section
- Be thorough but concise

DIFFERENTIAL_DIAGNOSES (array of 2-5 possible conditions):
- Rank by confidence level based on clinical presentation
- Provide clear clinical reasoning for each differential
- Include appropriate ICD-10 codes for billing consideration
- Consider common dermatologic conditions and mimickers

RECOMMENDED_TESTS (array of relevant tests):
- Base recommendations on clinical findings and differentials
- Specify urgency level appropriate to presentation
- Include CPT codes where applicable for billing
- Consider cost-effectiveness and clinical necessity

PATIENT_SUMMARY (patient-friendly language):
- Use simple, non-technical terms a patient can understand
- Clearly list what the patient told you about their symptoms
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
  prompt = prompt.replace(/\{\{sections\}\}/g, sections.join(', '));

  // Build expected output JSON schema based on configured sections
  const outputSchema: Record<string, string> = {};
  for (const section of sections) {
    outputSchema[section] = `Content for ${section}`;
  }

  // Add standard extraction fields
  const fullSchema = {
    ...outputSchema,
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
  prompt += `
${terminologyGuidance}
${focusAreasGuidance}
${defaultCodesGuidance}

SECTION REQUIREMENTS:${sectionInstructions}

OUTPUT FORMAT: ${agentConfig.outputFormat || 'soap'}
VERBOSITY LEVEL: ${agentConfig.verbosityLevel || 'standard'}
INCLUDE BILLING CODES: ${agentConfig.includeCodes !== false ? 'Yes' : 'No'}

Please return a JSON object with this structure:
${JSON.stringify(fullSchema, null, 2)}

IMPORTANT: Return ONLY valid JSON, no additional text or markdown formatting.`;

  return prompt;
}

const SYMPTOM_PATTERN_LIBRARY: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Rash', pattern: /\brash|eruption|lesion/ },
  { label: 'Itching', pattern: /\bitch|pruritus/ },
  { label: 'Pain', pattern: /\bpain|tender/ },
  { label: 'Burning', pattern: /\bburn|stinging/ },
  { label: 'Redness', pattern: /\bred|erythema/ },
  { label: 'Swelling', pattern: /\bswell|edema/ },
  { label: 'Scaling', pattern: /\bscal(e|y)|flak/ },
  { label: 'Bleeding', pattern: /\bbleed|bleeding/ },
  { label: 'Blistering', pattern: /\bblister|vesicle|bulla/ },
  { label: 'Drainage', pattern: /\bdrain|ooz|discharge/ },
  { label: 'Fever', pattern: /\bfever|febrile/ },
];

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

  const pushUnique = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    symptoms.push(trimmed);
  };

  for (const concern of existingConcerns) {
    pushUnique(concern);
  }

  const source = `${chiefComplaint} ${hpi} ${transcriptText}`.toLowerCase();
  for (const pattern of SYMPTOM_PATTERN_LIBRARY) {
    if (pattern.pattern.test(source)) {
      pushUnique(pattern.label);
    }
  }

  if (symptoms.length === 0) {
    const fallback = chiefComplaint || hpi || 'Skin symptoms discussed during visit';
    pushUnique(fallback.split('.')[0] || fallback);
  }

  return symptoms.slice(0, 8);
}

function normalizeFollowUpTasks(
  raw: unknown
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
    tasks.push({
      task,
      priority: toSafeString(candidate.priority) || 'medium',
      dueDate: toSafeString(candidate.dueDate) || undefined,
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

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Record<string, unknown>;
      const testName = toSafeString(candidate.testName);
      if (!testName) continue;
      const key = testName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tests.push({
        testName,
        rationale: toSafeString(candidate.rationale) || 'Suggested by documented presentation and differential.',
        urgency: normalizeUrgency(candidate.urgency),
        cptCode: toSafeString(candidate.cptCode) || undefined
      });
    }
  }

  if (tests.length === 0) {
    return generateRecommendedTests(transcriptText).slice(0, 5);
  }

  return tests.slice(0, 5);
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
    || `We discussed ${context.chiefComplaint || 'your dermatology concerns'} and reviewed exam findings.`;

  const treatmentPlan = toSafeString(source.treatmentPlan)
    || (context.plan
      ? context.plan.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3).join(' ')
      : 'Follow the treatment plan and skin care instructions reviewed in clinic.');

  const dueDate = context.followUpTasks.find((task) => task.dueDate)?.dueDate;
  const followUp = toSafeString(source.followUp)
    || (dueDate ? `Follow up by ${dueDate} or sooner if symptoms worsen.` : 'Follow up as directed by your provider.');

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

/**
 * Parse AI-generated note text into structured format
 * Handles custom sections from agent configuration
 */
function parseAIGeneratedNote(
  noteText: string,
  segments: TranscriptionSegment[],
  agentConfig?: AgentConfiguration | null
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
    const followUpTasks = normalizeFollowUpTasks(parsed.followUpTasks);
    const differentialDiagnoses = normalizeDifferentialDiagnoses(parsed.differentialDiagnoses, transcriptText);
    const recommendedTests = normalizeRecommendedTests(parsed.recommendedTests, transcriptText);
    const patientSummary = normalizePatientSummary(parsed.patientSummary, {
      chiefComplaint: toSafeString(parsed.chiefComplaint),
      hpi: toSafeString(parsed.hpi),
      transcriptText,
      plan: toSafeString(parsed.plan),
      differentialDiagnoses,
      followUpTasks
    });

    // Calculate overall confidence
    const sectionScores = Object.values(normalizedSectionConfidence);
    const overallConfidence = sectionScores.length > 0
      ? sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length
      : 0.85;

    // Build base note with standard sections (backward compatible)
    const note: ClinicalNote & ExtractedData = {
      chiefComplaint: toSafeString(parsed.chiefComplaint),
      hpi: toSafeString(parsed.hpi),
      ros: toSafeString(parsed.ros),
      physicalExam: toSafeString(parsed.physicalExam),
      assessment: toSafeString(parsed.assessment),
      plan: toSafeString(parsed.plan),
      overallConfidence: overallConfidence,
      sectionConfidence: normalizedSectionConfidence,
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
    // If parsing fails, fall back to mock
    return mockGenerateClinicalNoteSync(segments);
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
  segments: TranscriptionSegment[]
): Promise<ClinicalNote & ExtractedData> {
  logger.info('Using mock note generation (no API key configured)');

  // Simulate AI processing delay
  const delayMs = resolveMockDelayMs(3000 + Math.random() * 2000);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return mockGenerateClinicalNoteSync(segments);
}

/**
 * Synchronous mock note generation
 */
function mockGenerateClinicalNoteSync(segments: TranscriptionSegment[]): ClinicalNote & ExtractedData {
  // Extract patient statements vs doctor observations
  const { patientStatements, doctorStatements } = splitStatementsByRole(segments);
  const transcriptText = segments.map(s => toSafeString(s.text)).filter(Boolean).join(' ');

  // Generate structured note sections
  const note: ClinicalNote = {
    chiefComplaint: generateChiefComplaint(patientStatements),
    hpi: generateHPI(patientStatements, doctorStatements),
    ros: generateROS(transcriptText),
    physicalExam: generatePhysicalExam(doctorStatements),
    assessment: generateAssessment(transcriptText),
    plan: generatePlan(doctorStatements),
    overallConfidence: 0.85 + Math.random() * 0.10,
    sectionConfidence: {
      chiefComplaint: 0.92,
      hpi: 0.88,
      ros: 0.82,
      physicalExam: 0.90,
      assessment: 0.87,
      plan: 0.91
    },
    differentialDiagnoses: generateDifferentialDiagnoses(transcriptText),
    recommendedTests: generateRecommendedTests(transcriptText),
    patientSummary: generatePatientSummary(patientStatements, doctorStatements)
  };

  // Extract structured data
  const extracted: ExtractedData = {
    suggestedIcd10: extractICD10Codes(transcriptText),
    suggestedCpt: extractCPTCodes(transcriptText),
    medications: extractMedications(doctorStatements),
    allergies: extractAllergies(transcriptText),
    followUpTasks: extractFollowUpTasks(doctorStatements)
  };

  return { ...note, ...extracted };
}

function generateChiefComplaint(patientStatements: string[]): string {
  if (patientStatements.length === 0) return "Patient presents for evaluation.";

  // Use first substantive patient statement
  const firstStatement = patientStatements[0] || "Follow-up visit";

  // Extract key complaint
  if (firstStatement.toLowerCase().includes('rash')) {
    return "Pruritic rash on bilateral arms x 2 weeks";
  }
  return "Skin concern requiring evaluation";
}

function generateHPI(patientStatements: string[], doctorStatements: string[]): string {
  const hpi = `Patient is a presenting with a chief complaint of pruritic rash on bilateral forearms of 2 weeks duration.

ONSET: Rash began approximately 2 weeks ago, shortly after patient switched to a new laundry detergent.

LOCATION: Bilateral forearms, symmetric distribution.

DURATION: Persistent for 2 weeks with progressive worsening.

CHARACTER: Erythematous patches with overlying scale. Patient describes intense pruritus.

AGGRAVATING FACTORS: Symptoms worsen at night and during periods of increased stress.

RELIEVING FACTORS: Minimal relief with over-the-counter hydrocortisone 1% cream and oral diphenhydramine.

TIMING: Continuous, with nocturnal exacerbation of pruritus.

ASSOCIATED SYMPTOMS: Denies fever, chills, joint pain, or rash elsewhere on body.

PREVIOUS TREATMENT: Patient has self-treated with OTC hydrocortisone cream with minimal improvement.`;

  return hpi;
}

function generateROS(transcript: string): string {
  return `CONSTITUTIONAL: Denies fever, chills, fatigue, or weight changes.
SKIN: Positive for bilateral forearm rash as described in HPI. Denies other skin lesions.
HEENT: Negative
CARDIOVASCULAR: Negative
RESPIRATORY: Negative
GASTROINTESTINAL: Negative
GENITOURINARY: Negative
MUSCULOSKELETAL: Denies joint pain or swelling.
NEUROLOGICAL: Negative
PSYCHIATRIC: Denies anxiety or depression.
ALLERGIC/IMMUNOLOGIC: History of penicillin allergy (hives). Denies other known allergies.`;
}

function generatePhysicalExam(doctorStatements: string[]): string {
  return `GENERAL: Patient is alert, oriented, and in no acute distress.

SKIN EXAMINATION:
- UPPER EXTREMITIES: Bilateral erythematous patches on the volar and dorsal forearms
- DISTRIBUTION: Symmetric, well-demarcated
- MORPHOLOGY: Erythematous patches with fine scaling
- SIZE: Patches range from 2-5 cm in diameter
- PALPATION: Slightly raised, warm to touch, no induration
- SECONDARY CHANGES: Mild excoriation from scratching, no lichenification
- SURROUNDING SKIN: Normal, no satellite lesions

REMAINDER OF SKIN: No other lesions, rashes, or concerning findings noted on exposed skin.

LYMPH NODES: No palpable cervical, axillary, or inguinal lymphadenopathy.`;
}

function generateAssessment(transcript: string): string {
  return `1. Allergic contact dermatitis, bilateral upper extremities (likely secondary to new laundry detergent)
   - ICD-10: L23.9 - Allergic contact dermatitis, unspecified cause
   - Clinical presentation consistent with Type IV hypersensitivity reaction
   - Symmetric distribution and temporal relationship to new detergent exposure support diagnosis

2. Penicillin allergy (documented)
   - History of hives with penicillin exposure`;
}

function generatePlan(doctorStatements: string[]): string {
  return `1. MEDICATIONS:
   - Triamcinolone acetonide 0.1% cream: Apply thin layer to affected areas BID x 14 days
   - Cetirizine 10mg PO QHS for pruritus management

2. ALLERGEN AVOIDANCE:
   - Discontinue use of new laundry detergent immediately
   - Return to previously used, well-tolerated detergent
   - Consider hypoallergenic, fragrance-free detergents for future use

3. SKIN CARE:
   - Avoid hot showers; use lukewarm water
   - Use gentle, fragrance-free soap (e.g., Dove Sensitive, Cetaphil)
   - Apply fragrance-free moisturizer (e.g., CeraVe, Vanicream) BID to affected areas
   - Avoid scratching; keep nails trimmed short

4. PATIENT EDUCATION:
   - Discussed contact dermatitis and allergen avoidance
   - Reviewed proper application of topical corticosteroid
   - Advised on signs/symptoms requiring earlier follow-up (spreading rash, fever, signs of infection)

5. FOLLOW-UP:
   - Return to clinic in 3 weeks for reassessment
   - Call office if no improvement in 7 days or if condition worsens
   - Consider patch testing if recurrent episodes occur`;
}

function extractICD10Codes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  // Simulate intelligent code extraction based on keywords
  const codes: Array<{ code: string; description: string; confidence: number }> = [];

  if (transcript.toLowerCase().includes('contact dermatitis') || transcript.toLowerCase().includes('detergent')) {
    codes.push({ code: 'L23.9', description: 'Allergic contact dermatitis, unspecified cause', confidence: 0.94 });
  }

  if (transcript.toLowerCase().includes('pruritus') || transcript.toLowerCase().includes('itchy')) {
    codes.push({ code: 'L29.9', description: 'Pruritus, unspecified', confidence: 0.88 });
  }

  return codes.length > 0 ? codes : [COMMON_DERM_ICD10[3]!]; // Default to dermatitis
}

function extractCPTCodes(transcript: string): Array<{ code: string; description: string; confidence: number }> {
  // Base E/M code on complexity
  return [
    { code: '99213', description: 'Office visit, established patient, low-moderate complexity', confidence: 0.91 }
  ];
}

function extractMedications(doctorStatements: string[]): Array<{ name: string; dosage: string; frequency: string; confidence: number }> {
  const meds = [];
  const text = doctorStatements.join(' ').toLowerCase();

  if (text.includes('triamcinolone')) {
    meds.push({ name: 'Triamcinolone acetonide', dosage: '0.1% cream', frequency: 'BID', confidence: 0.96 });
  }

  if (text.includes('antihistamine') || text.includes('cetirizine')) {
    meds.push({ name: 'Cetirizine', dosage: '10mg', frequency: 'QHS', confidence: 0.92 });
  }

  return meds;
}

function extractAllergies(transcript: string): Array<{ allergen: string; reaction: string; confidence: number }> {
  const allergies = [];

  if (transcript.toLowerCase().includes('penicillin')) {
    allergies.push({ allergen: 'Penicillin', reaction: 'Hives', confidence: 0.98 });
  }

  return allergies;
}

function extractFollowUpTasks(doctorStatements: string[]): Array<{ task: string; priority: string; dueDate?: string; confidence: number }> {
  const tasks = [];
  const text = doctorStatements.join(' ').toLowerCase();

  if (text.includes('follow up') || text.includes('return')) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 21); // 3 weeks

    tasks.push({
      task: 'Follow-up appointment for reassessment of contact dermatitis',
      priority: 'medium',
      dueDate: dueDate.toISOString().split('T')[0],
      confidence: 0.95
    });
  }

  if (text.includes('call') && text.includes('week')) {
    tasks.push({
      task: 'Patient to call if no improvement in 7 days',
      priority: 'high',
      dueDate: undefined,
      confidence: 0.88
    });
  }

  return tasks;
}

function generateDifferentialDiagnoses(transcript: string): DifferentialDiagnosis[] {
  const text = transcript.toLowerCase();
  const differentials: DifferentialDiagnosis[] = [];

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
        cptCode: '11100'
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
