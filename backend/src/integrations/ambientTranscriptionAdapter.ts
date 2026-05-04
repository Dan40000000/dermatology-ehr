import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  TranscribeClient,
  StartMedicalScribeJobCommand,
  GetMedicalScribeJobCommand,
  type MedicalScribeNoteTemplate,
} from '@aws-sdk/client-transcribe';
import FormData from 'form-data';
import jwt from 'jsonwebtoken';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

export type AmbientTranscriptionProvider =
  | 'wispr_flow'
  | 'abridge'
  | 'nabla'
  | 'aws_healthscribe'
  | 'mock';

type GenericTranscriptionPayload = Record<string, any>;

type ProviderTransport = 'multipart' | 'nabla_multipart' | 'aws_healthscribe';
type SegmentTimeUnit = 'seconds' | 'milliseconds';

type ProviderDefaults = {
  label: string;
  transport: ProviderTransport;
  supportsLiveChunks: boolean;
  baseUrl: string;
  transcribePath: string;
  tokenPath?: string;
  apiKeyEnvKeys: string[];
  baseUrlEnvKeys: string[];
  transcribePathEnvKeys: string[];
  tokenPathEnvKeys: string[];
  languageEnvKeys: string[];
  workflowIdEnvKeys: string[];
  translateToEnvKeys: string[];
  apiVersionEnvKeys?: string[];
  regionEnvKeys?: string[];
  inputBucketEnvKeys?: string[];
  outputBucketEnvKeys?: string[];
  dataAccessRoleArnEnvKeys?: string[];
  inputPrefixEnvKeys?: string[];
  outputPrefixEnvKeys?: string[];
  noteTemplateEnvKeys?: string[];
  pollIntervalEnvKeys?: string[];
  timeoutMsEnvKeys?: string[];
  kmsKeyEnvKeys?: string[];
  fileFieldName: string;
  languageFieldName: string;
  workflowIdFieldName: string;
  translateToFieldName: string;
  requestParametersFieldName?: string;
  responseTextPaths: string[];
  responseLanguagePaths: string[];
  responseConfidencePaths: string[];
  responseSegmentsPaths: string[];
  segmentSpeakerField: string;
  segmentTextField: string;
  segmentStartField: string;
  segmentEndField: string;
  segmentConfidenceField: string;
  segmentTimeUnit: SegmentTimeUnit;
};

const PROVIDER_DEFAULTS: Record<Exclude<AmbientTranscriptionProvider, 'mock'>, ProviderDefaults> = {
  wispr_flow: {
    label: 'Wispr Flow',
    transport: 'multipart',
    supportsLiveChunks: true,
    baseUrl: 'https://api.wisprflow.ai',
    transcribePath: '/api/v1/voice-dictation/transcribe',
    apiKeyEnvKeys: ['WISPR_FLOW_API_KEY', 'WISPR_API_KEY'],
    baseUrlEnvKeys: ['WISPR_FLOW_BASE_URL'],
    transcribePathEnvKeys: ['WISPR_FLOW_TRANSCRIBE_PATH'],
    tokenPathEnvKeys: [],
    languageEnvKeys: ['WISPR_FLOW_LANGUAGE'],
    workflowIdEnvKeys: ['WISPR_FLOW_WORKFLOW_ID'],
    translateToEnvKeys: ['WISPR_FLOW_TRANSLATE_TO'],
    fileFieldName: 'file',
    languageFieldName: 'language',
    workflowIdFieldName: 'workflowId',
    translateToFieldName: 'translate_to',
    responseTextPaths: ['text', 'transcript'],
    responseLanguagePaths: ['detected_language', 'language'],
    responseConfidencePaths: ['confidence'],
    responseSegmentsPaths: ['segments'],
    segmentSpeakerField: 'speaker',
    segmentTextField: 'text',
    segmentStartField: 'start',
    segmentEndField: 'end',
    segmentConfidenceField: 'confidence',
    segmentTimeUnit: 'seconds',
  },
  abridge: {
    label: 'Abridge',
    transport: 'multipart',
    supportsLiveChunks: true,
    baseUrl: 'https://api.abridge.com',
    transcribePath: '/v1/transcriptions',
    apiKeyEnvKeys: ['ABRIDGE_API_KEY', 'ABRIDGE_ACCESS_TOKEN', 'ABRIDGE_TOKEN'],
    baseUrlEnvKeys: ['ABRIDGE_BASE_URL'],
    transcribePathEnvKeys: ['ABRIDGE_TRANSCRIBE_PATH'],
    tokenPathEnvKeys: [],
    languageEnvKeys: ['ABRIDGE_LANGUAGE'],
    workflowIdEnvKeys: ['ABRIDGE_WORKFLOW_ID'],
    translateToEnvKeys: ['ABRIDGE_TRANSLATE_TO'],
    fileFieldName: 'file',
    languageFieldName: 'language',
    workflowIdFieldName: 'workflowId',
    translateToFieldName: 'translate_to',
    responseTextPaths: ['text', 'transcript', 'data.transcript', 'output.transcript', 'result.transcript'],
    responseLanguagePaths: ['language', 'detected_language', 'data.language', 'output.language'],
    responseConfidencePaths: ['confidence', 'data.confidence', 'output.confidence', 'result.confidence'],
    responseSegmentsPaths: ['segments', 'utterances', 'data.segments', 'data.utterances', 'output.segments'],
    segmentSpeakerField: 'speaker',
    segmentTextField: 'text',
    segmentStartField: 'start',
    segmentEndField: 'end',
    segmentConfidenceField: 'confidence',
    segmentTimeUnit: 'seconds',
  },
  nabla: {
    label: 'Nabla',
    transport: 'nabla_multipart',
    supportsLiveChunks: true,
    baseUrl: 'https://us.api.nabla.com',
    transcribePath: '/v1/core/server/transcribe',
    tokenPath: '/oauth/token',
    apiKeyEnvKeys: ['NABLA_SERVER_ACCESS_TOKEN', 'NABLA_ACCESS_TOKEN'],
    baseUrlEnvKeys: ['NABLA_BASE_URL'],
    transcribePathEnvKeys: ['NABLA_TRANSCRIBE_PATH'],
    tokenPathEnvKeys: ['NABLA_TOKEN_PATH'],
    languageEnvKeys: ['NABLA_SPEECH_LOCALE', 'NABLA_LANGUAGE'],
    workflowIdEnvKeys: [],
    translateToEnvKeys: [],
    apiVersionEnvKeys: ['NABLA_API_VERSION'],
    fileFieldName: 'file',
    languageFieldName: 'speech_locale',
    workflowIdFieldName: 'workflowId',
    translateToFieldName: 'translate_to',
    requestParametersFieldName: 'request_parameters',
    responseTextPaths: ['text', 'transcript_text'],
    responseLanguagePaths: ['language', 'speech_locale'],
    responseConfidencePaths: ['confidence'],
    responseSegmentsPaths: ['transcript', 'segments'],
    segmentSpeakerField: 'speaker',
    segmentTextField: 'text',
    segmentStartField: 'start_offset_ms',
    segmentEndField: 'end_offset_ms',
    segmentConfidenceField: 'confidence',
    segmentTimeUnit: 'milliseconds',
  },
  aws_healthscribe: {
    label: 'AWS HealthScribe',
    transport: 'aws_healthscribe',
    supportsLiveChunks: false,
    baseUrl: '',
    transcribePath: '',
    apiKeyEnvKeys: [],
    baseUrlEnvKeys: [],
    transcribePathEnvKeys: [],
    tokenPathEnvKeys: [],
    languageEnvKeys: ['AWS_HEALTHSCRIBE_LANGUAGE', 'AWS_HEALTHSCRIBE_LOCALE'],
    workflowIdEnvKeys: [],
    translateToEnvKeys: [],
    regionEnvKeys: ['AWS_HEALTHSCRIBE_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION'],
    inputBucketEnvKeys: ['AWS_HEALTHSCRIBE_INPUT_BUCKET'],
    outputBucketEnvKeys: ['AWS_HEALTHSCRIBE_OUTPUT_BUCKET'],
    dataAccessRoleArnEnvKeys: ['AWS_HEALTHSCRIBE_DATA_ACCESS_ROLE_ARN'],
    inputPrefixEnvKeys: ['AWS_HEALTHSCRIBE_INPUT_PREFIX'],
    outputPrefixEnvKeys: ['AWS_HEALTHSCRIBE_OUTPUT_PREFIX'],
    noteTemplateEnvKeys: ['AWS_HEALTHSCRIBE_NOTE_TEMPLATE'],
    pollIntervalEnvKeys: ['AWS_HEALTHSCRIBE_POLL_INTERVAL_MS'],
    timeoutMsEnvKeys: ['AWS_HEALTHSCRIBE_TIMEOUT_MS'],
    kmsKeyEnvKeys: ['AWS_HEALTHSCRIBE_OUTPUT_KMS_KEY_ID'],
    fileFieldName: 'file',
    languageFieldName: 'language',
    workflowIdFieldName: 'workflowId',
    translateToFieldName: 'translate_to',
    responseTextPaths: ['Conversation.Transcript', 'transcript'],
    responseLanguagePaths: ['LanguageCode'],
    responseConfidencePaths: ['confidence'],
    responseSegmentsPaths: ['Conversation.TranscriptSegments', 'TranscriptSegments', 'segments'],
    segmentSpeakerField: 'ParticipantRole',
    segmentTextField: 'Content',
    segmentStartField: 'BeginOffsetMillis',
    segmentEndField: 'EndOffsetMillis',
    segmentConfidenceField: 'Confidence',
    segmentTimeUnit: 'milliseconds',
  },
};

type AwsHealthScribeRuntime = {
  region: string;
  inputBucket: string;
  outputBucket: string;
  dataAccessRoleArn: string;
  inputPrefix: string;
  outputPrefix: string;
  noteTemplate: MedicalScribeNoteTemplate;
  pollIntervalMs: number;
  timeoutMs: number;
  outputEncryptionKmsKeyId?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

export interface AmbientTranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  segments: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  source: Exclude<AmbientTranscriptionProvider, 'mock'> | 'mock';
}

function normalizeProvider(provider?: string | null): AmbientTranscriptionProvider {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'abridge') return 'abridge';
  if (normalized === 'nabla') return 'nabla';
  if (normalized === 'aws' || normalized === 'aws_healthscribe' || normalized === 'healthscribe') {
    return 'aws_healthscribe';
  }
  if (normalized === 'wispr' || normalized === 'wispr_flow') return 'wispr_flow';
  return 'mock';
}

function hasNonEmptyEnvValue(keys: string[]): boolean {
  return keys.some((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function hasNablaOAuthEnvCredentials(): boolean {
  return hasNonEmptyEnvValue(['NABLA_CLIENT_ID'])
    && hasNonEmptyEnvValue(['NABLA_PRIVATE_KEY', 'NABLA_PRIVATE_KEY_PEM', 'NABLA_SIGNING_PRIVATE_KEY']);
}

function hasAwsHealthScribeEnvConfig(): boolean {
  return hasNonEmptyEnvValue(PROVIDER_DEFAULTS.aws_healthscribe.inputBucketEnvKeys || [])
    && hasNonEmptyEnvValue(PROVIDER_DEFAULTS.aws_healthscribe.outputBucketEnvKeys || [])
    && hasNonEmptyEnvValue(PROVIDER_DEFAULTS.aws_healthscribe.dataAccessRoleArnEnvKeys || []);
}

export function resolveAmbientTranscriptionProviderFromEnv(): Exclude<AmbientTranscriptionProvider, 'mock'> | null {
  const explicit = normalizeProvider(process.env.AMBIENT_TRANSCRIPTION_PROVIDER);
  if (explicit !== 'mock') {
    return explicit;
  }

  if (hasAmbientTranscriptionCredentials('abridge')) {
    return 'abridge';
  }
  if (hasAmbientTranscriptionCredentials('nabla')) {
    return 'nabla';
  }
  if (hasAmbientTranscriptionCredentials('aws_healthscribe')) {
    return 'aws_healthscribe';
  }
  if (hasAmbientTranscriptionCredentials('wispr_flow')) {
    return 'wispr_flow';
  }

  return null;
}

export function hasAmbientTranscriptionCredentials(
  provider: Exclude<AmbientTranscriptionProvider, 'mock'>
): boolean {
  if (provider === 'nabla') {
    return hasNonEmptyEnvValue(PROVIDER_DEFAULTS.nabla.apiKeyEnvKeys) || hasNablaOAuthEnvCredentials();
  }

  if (provider === 'aws_healthscribe') {
    return hasAwsHealthScribeEnvConfig();
  }

  return hasNonEmptyEnvValue(PROVIDER_DEFAULTS[provider].apiKeyEnvKeys);
}

function buildSegmentsFromText(text: string, confidence: number): AmbientTranscriptionResult['segments'] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const usable = sentences.length > 0 ? sentences : [normalized];
  const segmentDuration = usable.length > 0 ? 1 / usable.length : 1;

  return usable.map((segment, index) => ({
    speaker: 'speaker_0',
    text: segment,
    start: Number((index * segmentDuration).toFixed(3)),
    end: Number(((index + 1) * segmentDuration).toFixed(3)),
    confidence,
  }));
}

function createSilentWavBuffer(sampleRate = 16000, durationMs = 250): Buffer {
  const samples = Math.max(1, Math.floor(sampleRate * (durationMs / 1000)));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function contentTypeForExtension(filename: string, fallback = 'audio/wav'): string {
  const ext = path.extname(filename).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.mp4': 'audio/mp4',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.flac': 'audio/flac',
  };

  return contentTypeMap[ext] || fallback;
}

function extensionForMimeType(mimeType?: string): string {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('wav')) return '.wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return '.m4a';
  if (normalized.includes('ogg')) return '.ogg';
  if (normalized.includes('flac')) return '.flac';
  return '.webm';
}

function normalizeMultilineSecret(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

function mapLanguageToNablaSpeechLocale(language?: string): string {
  const normalized = String(language || '').trim().toLowerCase();
  if (!normalized || normalized === 'en' || normalized === 'en-us' || normalized === 'english_us') {
    return 'ENGLISH_US';
  }
  if (normalized === 'en-gb' || normalized === 'english_uk') {
    return 'ENGLISH_UK';
  }
  return normalized.toUpperCase().replace(/-/g, '_');
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim().length > 0))));
}

function getValueAtPath(source: Record<string, any>, pathExpression: string): any {
  if (!pathExpression) return undefined;
  return pathExpression.split('.').reduce<any>((current, key) => {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      return current[Number(key)];
    }
    return current[key];
  }, source);
}

function getStringFromPaths(source: Record<string, any>, paths: string[]): string | null {
  for (const pathExpression of paths) {
    const value = getValueAtPath(source, pathExpression);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getNumberFromPaths(source: Record<string, any>, paths: string[]): number | null {
  for (const pathExpression of paths) {
    const value = getValueAtPath(source, pathExpression);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function getArrayFromPaths(source: Record<string, any>, paths: string[]): any[] {
  for (const pathExpression of paths) {
    const value = getValueAtPath(source, pathExpression);
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function normalizePathList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : fallback;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return fallback;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith('s3://')) {
    return null;
  }

  const withoutPrefix = uri.slice('s3://'.length);
  const slashIndex = withoutPrefix.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }

  const bucket = withoutPrefix.slice(0, slashIndex);
  const key = withoutPrefix.slice(slashIndex + 1);
  if (!bucket || !key) {
    return null;
  }

  return { bucket, key };
}

function parseS3HttpUri(uri: string): { bucket: string; key: string } | null {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }

    const hostParts = parsed.hostname.split('.');
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (pathParts.length === 0) {
      return null;
    }

    const isPathStyleS3Host = hostParts[0] === 's3';
    if (isPathStyleS3Host) {
      const [bucket, ...rest] = pathParts;
      if (!bucket || rest.length === 0) {
        return null;
      }
      return { bucket, key: rest.join('/') };
    }

    const s3Index = hostParts.findIndex((part) => part === 's3');
    if (s3Index > 0) {
      const bucket = hostParts.slice(0, s3Index).join('.');
      if (!bucket) {
        return null;
      }
      return { bucket, key: pathParts.join('/') };
    }

    return null;
  } catch {
    return null;
  }
}

function sanitizeJobName(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 180) || `scribe-${crypto.randomUUID()}`;
}

function parseJsonObject(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : null;
  } catch {
    return null;
  }
}

function findFirstSegmentArray(value: unknown): Record<string, any>[] {
  if (Array.isArray(value)) {
    const valid = value.filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object'));
    if (
      valid.length > 0 &&
      valid.some((item) =>
        ['text', 'Content', 'content', 'transcript', 'speaker', 'ParticipantRole', 'speaker_type']
          .some((key) => getValueAtPath(item, key) !== undefined)
      )
    ) {
      return valid;
    }

    for (const item of valid) {
      const nested = findFirstSegmentArray(item);
      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const segments = findFirstSegmentArray(nested);
      if (segments.length > 0) {
        return segments;
      }
    }
  }

  return [];
}

export class AmbientTranscriptionAdapter extends BaseAdapter {
  private provider: Exclude<AmbientTranscriptionProvider, 'mock'>;
  private static nablaTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

  constructor(options: AdapterOptions & { provider?: string }) {
    super(options);
    const provider = normalizeProvider(options.provider);
    this.provider = provider === 'mock' ? 'abridge' : provider;
  }

  getIntegrationType(): string {
    return 'ambient_transcription';
  }

  getProvider(): string {
    return this.provider;
  }

  supportsLiveChunks(): boolean {
    return this.getProviderDefaults().supportsLiveChunks;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      return {
        success: true,
        message: `Connected to ${this.getProviderLabel()} ambient transcription (mock mode)`,
      };
    }

    try {
      const durationMs = this.provider === 'aws_healthscribe' ? 750 : 250;
      await this.transcribeAudioBuffer(createSilentWavBuffer(16000, durationMs), {
        filename: `${this.provider}-connection-test.wav`,
        contentType: 'audio/wav',
        language: this.getLanguage(),
      });

      return {
        success: true,
        message: `Connected to ${this.getProviderLabel()} ambient transcription`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || `${this.getProviderLabel()} connection failed`,
      };
    }
  }

  async transcribeFile(audioFilePath: string): Promise<AmbientTranscriptionResult> {
    if (this.useMock) {
      return this.buildMockResult('recording');
    }

    const audioBuffer = await fs.readFile(audioFilePath);
    const filename = path.basename(audioFilePath) || 'recording.wav';
    return this.transcribeAudioBuffer(audioBuffer, {
      filename,
      contentType: contentTypeForExtension(filename),
      language: this.getLanguage(),
    });
  }

  async transcribeBuffer(audioBuffer: Buffer, mimeType?: string): Promise<AmbientTranscriptionResult> {
    if (this.useMock) {
      return this.buildMockResult('live');
    }

    if (!this.supportsLiveChunks()) {
      throw new Error(`${this.getProviderLabel()} live chunk transcription is not supported in this app. Use recorded encounter processing instead.`);
    }

    const extension = extensionForMimeType(mimeType);
    return this.transcribeAudioBuffer(audioBuffer, {
      filename: `live-chunk-${crypto.randomUUID()}${extension}`,
      contentType: mimeType || contentTypeForExtension(`chunk${extension}`),
      language: this.getLanguage(),
    });
  }

  private getProviderLabel(): string {
    return PROVIDER_DEFAULTS[this.provider].label;
  }

  private getProviderDefaults(): ProviderDefaults {
    return PROVIDER_DEFAULTS[this.provider];
  }

  private buildMockResult(mode: 'recording' | 'live'): AmbientTranscriptionResult {
    const providerLabel = this.getProviderLabel();
    const text = mode === 'live'
      ? `Mock live ${providerLabel} transcript.`
      : `Mock ${providerLabel} transcript.`;

    return {
      text,
      language: this.provider === 'aws_healthscribe' ? 'en-US' : 'en',
      confidence: mode === 'live' ? 0.75 : 0.8,
      segments: buildSegmentsFromText(text, mode === 'live' ? 0.75 : 0.8),
      source: 'mock',
    };
  }

  private getCredentialOrConfigString(
    credentials: Record<string, any>,
    credentialKeys: string[],
    configKeys: string[],
    envKeys: string[],
    fallback: string
  ): string {
    for (const key of credentialKeys) {
      const value = credentials[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return this.getConfigString(configKeys, envKeys, fallback);
  }

  private getConfigString(configKeys: string[], envKeys: string[], fallback: string): string {
    for (const key of configKeys) {
      const value = this.config?.config?.[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    for (const key of envKeys) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return fallback;
  }

  private getConfigNumber(configKeys: string[], envKeys: string[], fallback: number): number {
    for (const key of configKeys) {
      const value = this.config?.config?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    for (const key of envKeys) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return fallback;
  }

  private getConfigBoolean(configKeys: string[], fallback: boolean): boolean {
    for (const key of configKeys) {
      const value = this.config?.config?.[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        if (value.trim().toLowerCase() === 'true') return true;
        if (value.trim().toLowerCase() === 'false') return false;
      }
    }

    return fallback;
  }

  private getBaseUrl(): string {
    const defaults = this.getProviderDefaults();
    return this.getConfigString(['baseUrl', 'base_url'], defaults.baseUrlEnvKeys, defaults.baseUrl).replace(/\/+$/, '');
  }

  private getTranscribePath(): string {
    const defaults = this.getProviderDefaults();
    return this.getConfigString(['transcribePath', 'transcribe_path'], defaults.transcribePathEnvKeys, defaults.transcribePath);
  }

  private getTokenPath(): string {
    const defaults = this.getProviderDefaults();
    return this.getConfigString(['tokenPath', 'token_path'], defaults.tokenPathEnvKeys, defaults.tokenPath || '/oauth/token');
  }

  private getLanguage(): string {
    const defaults = this.getProviderDefaults();
    return this.getConfigString(['language'], defaults.languageEnvKeys, this.provider === 'aws_healthscribe' ? 'en-US' : 'en');
  }

  private getDirectToken(credentials: Record<string, any>): string | null {
    const credentialKeys = [
      'apiKey',
      'api_key',
      'accessToken',
      'access_token',
      'token',
      'bearerToken',
      'bearer_token',
      'serverAccessToken',
      'server_access_token',
    ];

    for (const key of credentialKeys) {
      const value = credentials[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    for (const envKey of this.getProviderDefaults().apiKeyEnvKeys) {
      const value = process.env[envKey];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private getWorkflowId(): string | null {
    const defaults = this.getProviderDefaults();
    const workflowId = this.getConfigString(['workflowId', 'workflow_id'], defaults.workflowIdEnvKeys, '');
    return workflowId || null;
  }

  private getTranslateTo(): string | null {
    const defaults = this.getProviderDefaults();
    const translateTo = this.getConfigString(['translateTo', 'translate_to'], defaults.translateToEnvKeys, '');
    return translateTo || null;
  }

  private getFileFieldName(): string {
    return this.getConfigString(['fileFieldName', 'file_field_name'], [], this.getProviderDefaults().fileFieldName);
  }

  private getLanguageFieldName(): string {
    return this.getConfigString(['languageFieldName', 'language_field_name'], [], this.getProviderDefaults().languageFieldName);
  }

  private getWorkflowFieldName(): string {
    return this.getConfigString(['workflowIdFieldName', 'workflow_id_field_name'], [], this.getProviderDefaults().workflowIdFieldName);
  }

  private getTranslateFieldName(): string {
    return this.getConfigString(['translateToFieldName', 'translate_to_field_name'], [], this.getProviderDefaults().translateToFieldName);
  }

  private getRequestParametersFieldName(): string {
    return this.getConfigString(
      ['requestParametersFieldName', 'request_parameters_field_name'],
      [],
      this.getProviderDefaults().requestParametersFieldName || 'request_parameters'
    );
  }

  private getExtraFields(): Record<string, any> {
    const extraFields = this.config?.config?.extraFields;
    return extraFields && typeof extraFields === 'object' && !Array.isArray(extraFields)
      ? extraFields as Record<string, any>
      : {};
  }

  private getExtraHeaders(): Record<string, string> {
    const extraHeaders = this.config?.config?.extraHeaders;
    if (!extraHeaders || typeof extraHeaders !== 'object' || Array.isArray(extraHeaders)) {
      return {};
    }

    return Object.entries(extraHeaders as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        acc[key] = value.trim();
      }
      return acc;
    }, {});
  }

  private getResponseTextPaths(): string[] {
    return normalizePathList(
      this.config?.config?.responseTextPath ?? this.config?.config?.responseTextPaths,
      this.getProviderDefaults().responseTextPaths
    );
  }

  private getResponseLanguagePaths(): string[] {
    return normalizePathList(
      this.config?.config?.responseLanguagePath ?? this.config?.config?.responseLanguagePaths,
      this.getProviderDefaults().responseLanguagePaths
    );
  }

  private getResponseConfidencePaths(): string[] {
    return normalizePathList(
      this.config?.config?.responseConfidencePath ?? this.config?.config?.responseConfidencePaths,
      this.getProviderDefaults().responseConfidencePaths
    );
  }

  private getResponseSegmentsPaths(): string[] {
    return normalizePathList(
      this.config?.config?.responseSegmentsPath ?? this.config?.config?.responseSegmentsPaths,
      this.getProviderDefaults().responseSegmentsPaths
    );
  }

  private getSegmentField(key: 'speaker' | 'text' | 'start' | 'end' | 'confidence'): string {
    const defaults = this.getProviderDefaults();
    const fallbackByKey = {
      speaker: defaults.segmentSpeakerField,
      text: defaults.segmentTextField,
      start: defaults.segmentStartField,
      end: defaults.segmentEndField,
      confidence: defaults.segmentConfidenceField,
    } as const;
    return this.getConfigString([
      `segment${key.charAt(0).toUpperCase()}${key.slice(1)}Field`,
      `segment_${key}_field`,
    ], [], fallbackByKey[key]);
  }

  private getSegmentTimeUnit(): SegmentTimeUnit {
    const configured = this.getConfigString(['segmentTimeUnit', 'segment_time_unit'], [], this.getProviderDefaults().segmentTimeUnit);
    return configured === 'milliseconds' ? 'milliseconds' : 'seconds';
  }

  private appendFormField(formData: FormData, key: string, value: unknown): void {
    if (value === undefined || value === null || key.trim().length === 0) {
      return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      formData.append(key, String(value));
      return;
    }

    formData.append(key, JSON.stringify(value));
  }

  private normalizeSegmentTime(raw: number | null): number | null {
    if (raw === null) {
      return null;
    }

    if (this.getSegmentTimeUnit() === 'milliseconds') {
      return Number((raw / 1000).toFixed(3));
    }

    return raw;
  }

  private getSegmentCandidatePaths(key: 'speaker' | 'text' | 'start' | 'end' | 'confidence'): string[] {
    const configured = this.getSegmentField(key);
    const providerFallbacks: Record<typeof key, string[]> = {
      speaker: ['speaker', 'speaker_type', 'ParticipantRole', 'participant_role'],
      text: ['text', 'transcript', 'Content', 'content', 'Alternatives.0.Content', 'alternatives.0.content'],
      start: ['start', 'start_offset_ms', 'BeginOffsetMillis', 'begin_offset_millis', 'StartTime', 'start_time'],
      end: ['end', 'end_offset_ms', 'EndOffsetMillis', 'end_offset_millis', 'EndTime', 'end_time'],
      confidence: ['confidence', 'Confidence', 'Alternatives.0.Confidence', 'alternatives.0.confidence'],
    };

    return uniqueStrings([configured, ...providerFallbacks[key]]);
  }

  private extractSegments(payload: GenericTranscriptionPayload, fallbackText: string, confidence: number): AmbientTranscriptionResult['segments'] {
    const rawSegments = (() => {
      const explicit = getArrayFromPaths(payload, this.getResponseSegmentsPaths());
      if (explicit.length > 0) {
        return explicit;
      }
      return findFirstSegmentArray(payload);
    })();

    if (rawSegments.length === 0) {
      return buildSegmentsFromText(fallbackText, confidence);
    }

    const speakerPaths = this.getSegmentCandidatePaths('speaker');
    const textPaths = this.getSegmentCandidatePaths('text');
    const startPaths = this.getSegmentCandidatePaths('start');
    const endPaths = this.getSegmentCandidatePaths('end');
    const confidencePaths = this.getSegmentCandidatePaths('confidence');

    const segments = rawSegments
      .filter((segment) => segment && typeof segment === 'object')
      .map((segment, index) => {
        const text = getStringFromPaths(segment, textPaths);
        if (!text) {
          return null;
        }

        const segmentConfidence = getNumberFromPaths(segment, confidencePaths) ?? confidence;
        const start = this.normalizeSegmentTime(getNumberFromPaths(segment, startPaths)) ?? index;
        const end = this.normalizeSegmentTime(getNumberFromPaths(segment, endPaths)) ?? index + 1;

        return {
          speaker: String(getStringFromPaths(segment, speakerPaths) || `speaker_${index === 0 ? 0 : 1}`),
          text,
          start,
          end,
          confidence: segmentConfidence,
        };
      })
      .filter((segment): segment is AmbientTranscriptionResult['segments'][number] => Boolean(segment));

    return segments.length > 0 ? segments : buildSegmentsFromText(fallbackText, confidence);
  }

  private composeTextFromSegments(segments: AmbientTranscriptionResult['segments']): string {
    return segments.map((segment) => segment.text).filter(Boolean).join(' ').trim();
  }

  private async getNablaAccessToken(credentials: Record<string, any>): Promise<string> {
    const directToken = this.getDirectToken(credentials);
    if (directToken) {
      return directToken;
    }

    const clientId = this.getCredentialOrConfigString(
      credentials,
      ['clientId', 'client_id'],
      ['clientId', 'client_id'],
      ['NABLA_CLIENT_ID'],
      ''
    );
    const privateKey = this.getCredentialOrConfigString(
      credentials,
      ['privateKeyPem', 'privateKey', 'private_key_pem', 'private_key'],
      ['privateKeyPem', 'privateKey', 'private_key_pem', 'private_key'],
      ['NABLA_PRIVATE_KEY', 'NABLA_PRIVATE_KEY_PEM', 'NABLA_SIGNING_PRIVATE_KEY'],
      ''
    );
    const keyId = this.getCredentialOrConfigString(
      credentials,
      ['keyId', 'key_id'],
      ['keyId', 'key_id'],
      ['NABLA_KEY_ID'],
      ''
    );
    if (!clientId || !privateKey) {
      throw new Error('Missing Nabla access token or OAuth client credentials');
    }

    const tokenUrl = `${this.getBaseUrl()}${this.getTokenPath()}`;
    const cacheKey = `${clientId}:${tokenUrl}`;
    const cached = AmbientTranscriptionAdapter.nablaTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const assertion = jwt.sign(
      {
        iss: clientId,
        sub: clientId,
        aud: tokenUrl,
        jti: crypto.randomUUID(),
      },
      normalizeMultilineSecret(privateKey),
      {
        algorithm: 'RS256',
        expiresIn: '5m',
        keyid: keyId || undefined,
      }
    );

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Nabla token request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json() as Record<string, any>;
    const accessToken = String(payload.access_token || '').trim();
    const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : Number(payload.expires_in || 3600);
    if (!accessToken) {
      throw new Error('Nabla token response did not include an access token');
    }

    AmbientTranscriptionAdapter.nablaTokenCache.set(cacheKey, {
      accessToken,
      expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    });
    return accessToken;
  }

  private getNablaApiVersion(): string | null {
    const defaults = this.getProviderDefaults();
    const version = this.getConfigString(['apiVersion', 'api_version'], defaults.apiVersionEnvKeys || [], '2025-05-21');
    return version || null;
  }

  private buildNablaRequestParameters(language?: string): Record<string, any> {
    const configured = this.config?.config?.requestParameters;
    const base = configured && typeof configured === 'object' && !Array.isArray(configured)
      ? { ...(configured as Record<string, any>) }
      : {};

    if (!base.speech_locale) {
      base.speech_locale = mapLanguageToNablaSpeechLocale(language || this.getLanguage());
    }
    if (base.split_by_sentence === undefined) {
      base.split_by_sentence = true;
    }

    const specialty = this.getConfigString(['specialty'], ['NABLA_SPECIALTY'], '');
    if (specialty && base.specialty === undefined) {
      base.specialty = specialty;
    }

    return base;
  }

  private getAwsRuntime(credentials: Record<string, any>): AwsHealthScribeRuntime {
    const defaults = this.getProviderDefaults();
    const region = this.getConfigString(['region'], defaults.regionEnvKeys || [], 'us-east-1');
    const inputBucket = this.getConfigString(['inputBucket', 'input_bucket'], defaults.inputBucketEnvKeys || [], '');
    const outputBucket = this.getConfigString(['outputBucket', 'output_bucket'], defaults.outputBucketEnvKeys || [], '');
    const dataAccessRoleArn = this.getConfigString(['dataAccessRoleArn', 'data_access_role_arn'], defaults.dataAccessRoleArnEnvKeys || [], '');

    if (!inputBucket || !outputBucket || !dataAccessRoleArn) {
      throw new Error('Missing AWS HealthScribe S3/IAM configuration');
    }

    const accessKeyId = this.getCredentialOrConfigString(
      credentials,
      ['accessKeyId', 'access_key_id'],
      ['accessKeyId', 'access_key_id'],
      ['AWS_ACCESS_KEY_ID'],
      ''
    );
    const secretAccessKey = this.getCredentialOrConfigString(
      credentials,
      ['secretAccessKey', 'secret_access_key'],
      ['secretAccessKey', 'secret_access_key'],
      ['AWS_SECRET_ACCESS_KEY'],
      ''
    );
    const sessionToken = this.getCredentialOrConfigString(
      credentials,
      ['sessionToken', 'session_token'],
      ['sessionToken', 'session_token'],
      ['AWS_SESSION_TOKEN'],
      ''
    );

    return {
      region,
      inputBucket,
      outputBucket,
      dataAccessRoleArn,
      inputPrefix: this.getConfigString(['inputPrefix', 'input_prefix'], defaults.inputPrefixEnvKeys || [], 'healthscribe/input'),
      outputPrefix: this.getConfigString(['outputPrefix', 'output_prefix'], defaults.outputPrefixEnvKeys || [], 'healthscribe/output'),
      noteTemplate: this.getConfigString(['noteTemplate', 'note_template'], defaults.noteTemplateEnvKeys || [], 'PHYSICAL_SOAP') as MedicalScribeNoteTemplate,
      pollIntervalMs: this.getConfigNumber(['pollIntervalMs', 'poll_interval_ms'], defaults.pollIntervalEnvKeys || [], 5000),
      timeoutMs: this.getConfigNumber(['timeoutMs', 'timeout_ms'], defaults.timeoutMsEnvKeys || [], 5 * 60 * 1000),
      outputEncryptionKmsKeyId: this.getConfigString(['outputEncryptionKmsKeyId', 'output_encryption_kms_key_id'], defaults.kmsKeyEnvKeys || [], '') || undefined,
      credentials: accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            sessionToken: sessionToken || undefined,
          }
        : undefined,
    };
  }

  private createAwsS3Client(runtime: AwsHealthScribeRuntime): S3Client {
    return new S3Client({
      region: runtime.region,
      credentials: runtime.credentials,
    });
  }

  private createAwsTranscribeClient(runtime: AwsHealthScribeRuntime): TranscribeClient {
    return new TranscribeClient({
      region: runtime.region,
      credentials: runtime.credentials,
    });
  }

  private async readJsonFromUri(uri: string, runtime: AwsHealthScribeRuntime, s3Client: S3Client): Promise<Record<string, any>> {
    const s3Ref = parseS3Uri(uri) || parseS3HttpUri(uri);
    if (s3Ref) {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: s3Ref.bucket,
        Key: s3Ref.key,
      }));
      const body = response.Body as Readable | undefined;
      if (!body) {
        throw new Error('AWS HealthScribe transcript output was empty');
      }
      const payload = await streamToBuffer(body);
      return JSON.parse(payload.toString('utf8')) as Record<string, any>;
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`AWS HealthScribe transcript fetch failed: ${response.status}`);
    }
    return response.json() as Promise<Record<string, any>>;
  }

  private async transcribeWithAwsHealthScribe(
    audioBuffer: Buffer,
    options: { filename: string; contentType: string; language?: string }
  ): Promise<AmbientTranscriptionResult> {
    const runtime = this.getAwsRuntime(this.getCredentials());
    const s3Client = this.createAwsS3Client(runtime);
    const transcribeClient = this.createAwsTranscribeClient(runtime);
    const mediaFileKey = `${runtime.inputPrefix.replace(/^\/+|\/+$/g, '')}/${crypto.randomUUID()}-${options.filename}`;
    const mediaFileUri = `s3://${runtime.inputBucket}/${mediaFileKey}`;
    const jobName = sanitizeJobName(`ambient-${this.tenantId}-${Date.now()}-${path.parse(options.filename).name}`);
    const startedAt = Date.now();

    await s3Client.send(new PutObjectCommand({
      Bucket: runtime.inputBucket,
      Key: mediaFileKey,
      Body: audioBuffer,
      ContentType: options.contentType,
    }));

    await transcribeClient.send(new StartMedicalScribeJobCommand({
      MedicalScribeJobName: jobName,
      Media: {
        MediaFileUri: mediaFileUri,
      },
      OutputBucketName: runtime.outputBucket,
      DataAccessRoleArn: runtime.dataAccessRoleArn,
      Settings: {
        ShowSpeakerLabels: this.getConfigBoolean(['showSpeakerLabels', 'show_speaker_labels'], true),
        MaxSpeakerLabels: this.getConfigNumber(['maxSpeakerLabels', 'max_speaker_labels'], [], 2),
        ClinicalNoteGenerationSettings: {
          NoteTemplate: runtime.noteTemplate,
        },
      },
      ...(runtime.outputEncryptionKmsKeyId ? { OutputEncryptionKMSKeyId: runtime.outputEncryptionKmsKeyId } : {}),
    }));

    while (Date.now() - startedAt < runtime.timeoutMs) {
      const jobResponse = await transcribeClient.send(new GetMedicalScribeJobCommand({
        MedicalScribeJobName: jobName,
      }));
      const job = jobResponse.MedicalScribeJob;
      const status = job?.MedicalScribeJobStatus;

      if (status === 'COMPLETED') {
        const transcriptUri = job?.MedicalScribeOutput?.TranscriptFileUri;
        if (!transcriptUri) {
          throw new Error('AWS HealthScribe completed without a transcript URI');
        }

        const payload = await this.readJsonFromUri(transcriptUri, runtime, s3Client);
        const confidence = getNumberFromPaths(payload, this.getResponseConfidencePaths()) ?? 0.85;
        const preliminaryText = getStringFromPaths(payload, this.getResponseTextPaths()) || '';
        const segments = this.extractSegments(payload, preliminaryText, confidence);
        const text = preliminaryText || this.composeTextFromSegments(segments);
        const durationMs = Date.now() - startedAt;

        await this.logIntegration({
          direction: 'outbound',
          endpoint: `aws://${runtime.region}/medicalscribejobs/${jobName}`,
          method: 'PUT',
          request: {
            provider: this.provider,
            mediaFileUri,
            outputBucket: runtime.outputBucket,
            noteTemplate: runtime.noteTemplate,
          },
          response: {
            provider: this.provider,
            jobName,
            transcriptLength: text.length,
            transcriptUri,
            clinicalDocumentUri: job?.MedicalScribeOutput?.ClinicalDocumentUri,
          },
          status: 'success',
          statusCode: 200,
          durationMs,
        });

        return {
          text,
          language: getStringFromPaths(payload, this.getResponseLanguagePaths()) || options.language || this.getLanguage() || 'en-US',
          confidence,
          segments,
          source: 'aws_healthscribe',
        };
      }

      if (status === 'FAILED') {
        const durationMs = Date.now() - startedAt;
        const failureReason = job?.FailureReason || 'Unknown AWS HealthScribe failure';
        await this.logIntegration({
          direction: 'outbound',
          endpoint: `aws://${runtime.region}/medicalscribejobs/${jobName}`,
          method: 'PUT',
          request: {
            provider: this.provider,
            mediaFileUri,
            outputBucket: runtime.outputBucket,
          },
          status: 'error',
          statusCode: 500,
          errorMessage: failureReason,
          durationMs,
        });
        throw new Error(`AWS HealthScribe transcription failed: ${failureReason}`);
      }

      await sleep(runtime.pollIntervalMs);
    }

    throw new Error(`AWS HealthScribe transcription timed out after ${runtime.timeoutMs}ms`);
  }

  private async transcribeMultipart(
    audioBuffer: Buffer,
    options: { filename: string; contentType: string; language?: string }
  ): Promise<AmbientTranscriptionResult> {
    const credentials = this.getCredentials();
    const accessToken = this.getDirectToken(credentials);
    if (!accessToken) {
      throw new Error(`Missing ${this.getProviderLabel()} API key`);
    }

    const endpoint = `${this.getBaseUrl()}${this.getTranscribePath()}`;
    const formData = new FormData();
    formData.append(this.getFileFieldName(), audioBuffer, {
      filename: options.filename,
      contentType: options.contentType,
    });
    formData.append(this.getLanguageFieldName(), options.language || this.getLanguage());

    const workflowId = this.getWorkflowId();
    if (workflowId) {
      formData.append(this.getWorkflowFieldName(), workflowId);
    }

    const translateTo = this.getTranslateTo();
    if (translateTo) {
      formData.append(this.getTranslateFieldName(), translateTo);
    }

    for (const [key, value] of Object.entries(this.getExtraFields())) {
      this.appendFormField(formData, key, value);
    }

    const startedAt = Date.now();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...this.getExtraHeaders(),
        ...formData.getHeaders(),
      },
      body: formData.getBuffer(),
    });
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text();
      await this.logIntegration({
        direction: 'outbound',
        endpoint,
        method: 'POST',
        request: {
          provider: this.provider,
          filename: options.filename,
          contentType: options.contentType,
          language: options.language || this.getLanguage(),
          workflowId: workflowId || undefined,
          translateTo: translateTo || undefined,
          extraFields: this.getExtraFields(),
        },
        status: 'error',
        statusCode: response.status,
        errorMessage: errorText,
        durationMs,
      });
      throw new Error(`${this.getProviderLabel()} transcription failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as GenericTranscriptionPayload;
    const confidence = getNumberFromPaths(payload, this.getResponseConfidencePaths()) ?? 0.85;
    const preliminaryText = getStringFromPaths(payload, this.getResponseTextPaths()) || '';
    const segments = this.extractSegments(payload, preliminaryText, confidence);
    const text = preliminaryText || this.composeTextFromSegments(segments);

    await this.logIntegration({
      direction: 'outbound',
      endpoint,
      method: 'POST',
      request: {
        provider: this.provider,
        filename: options.filename,
        contentType: options.contentType,
        language: options.language || this.getLanguage(),
        workflowId: workflowId || undefined,
        translateTo: translateTo || undefined,
        extraFields: this.getExtraFields(),
      },
      response: {
        provider: this.provider,
        transcriptLength: text.length,
        payloadPreviewKeys: Object.keys(payload || {}).slice(0, 12),
      },
      status: 'success',
      statusCode: response.status,
      durationMs,
    });

    return {
      text,
      language: getStringFromPaths(payload, this.getResponseLanguagePaths()) || options.language || this.getLanguage() || 'en',
      confidence,
      segments,
      source: this.provider,
    };
  }

  private async transcribeWithNabla(
    audioBuffer: Buffer,
    options: { filename: string; contentType: string; language?: string }
  ): Promise<AmbientTranscriptionResult> {
    const credentials = this.getCredentials();
    const accessToken = await this.getNablaAccessToken(credentials);
    const endpoint = `${this.getBaseUrl()}${this.getTranscribePath()}`;
    const requestParameters = this.buildNablaRequestParameters(options.language || this.getLanguage());
    const formData = new FormData();

    formData.append(this.getFileFieldName(), audioBuffer, {
      filename: options.filename,
      contentType: options.contentType,
    });
    formData.append(this.getRequestParametersFieldName(), JSON.stringify(requestParameters));

    for (const [key, value] of Object.entries(this.getExtraFields())) {
      this.appendFormField(formData, key, value);
    }

    const startedAt = Date.now();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      ...this.getExtraHeaders(),
      ...formData.getHeaders(),
    };
    const apiVersion = this.getNablaApiVersion();
    if (apiVersion) {
      headers['X-Nabla-Api-Version'] = apiVersion;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData.getBuffer(),
    });
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorText = await response.text();
      await this.logIntegration({
        direction: 'outbound',
        endpoint,
        method: 'POST',
        request: {
          provider: this.provider,
          filename: options.filename,
          contentType: options.contentType,
          requestParameters,
        },
        status: 'error',
        statusCode: response.status,
        errorMessage: errorText,
        durationMs,
      });
      throw new Error(`Nabla transcription failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as GenericTranscriptionPayload;
    const confidence = getNumberFromPaths(payload, this.getResponseConfidencePaths()) ?? 0.85;
    const preliminaryText = getStringFromPaths(payload, this.getResponseTextPaths()) || '';
    const segments = this.extractSegments(payload, preliminaryText, confidence);
    const text = preliminaryText || this.composeTextFromSegments(segments);

    await this.logIntegration({
      direction: 'outbound',
      endpoint,
      method: 'POST',
      request: {
        provider: this.provider,
        filename: options.filename,
        contentType: options.contentType,
        requestParameters,
      },
      response: {
        provider: this.provider,
        transcriptLength: text.length,
        payloadPreviewKeys: Object.keys(payload || {}).slice(0, 12),
      },
      status: 'success',
      statusCode: response.status,
      durationMs,
    });

    return {
      text,
      language: getStringFromPaths(payload, this.getResponseLanguagePaths()) || requestParameters.speech_locale || 'ENGLISH_US',
      confidence,
      segments,
      source: 'nabla',
    };
  }

  private async transcribeAudioBuffer(
    audioBuffer: Buffer,
    options: { filename: string; contentType: string; language?: string }
  ): Promise<AmbientTranscriptionResult> {
    switch (this.getProviderDefaults().transport) {
      case 'aws_healthscribe':
        return this.transcribeWithAwsHealthScribe(audioBuffer, options);
      case 'nabla_multipart':
        return this.transcribeWithNabla(audioBuffer, options);
      case 'multipart':
      default:
        return this.transcribeMultipart(audioBuffer, options);
    }
  }
}

export function createAmbientTranscriptionAdapter(
  tenantId: string,
  provider: string = resolveAmbientTranscriptionProviderFromEnv() || 'abridge',
  useMock: boolean = true
): AmbientTranscriptionAdapter {
  return new AmbientTranscriptionAdapter({
    tenantId,
    provider,
    useMock,
  });
}
