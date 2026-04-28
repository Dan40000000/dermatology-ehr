import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import { BaseAdapter, AdapterOptions } from './baseAdapter';

type WisprTranscriptionResponse = {
  text?: string;
  transcript?: string;
  success?: boolean;
  workflowId?: string;
  userId?: string;
  performance_metrics?: {
    total_time?: number;
    transcription_time?: number;
    llm_processing_time?: number;
  };
  detected_language?: string;
  segments?: Array<{
    text?: string;
    speaker?: string;
    start?: number;
    end?: number;
    confidence?: number;
  }>;
  language?: string;
  confidence?: number;
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
  source: 'wispr_flow' | 'mock';
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

export class AmbientTranscriptionAdapter extends BaseAdapter {
  private provider: string;

  constructor(options: AdapterOptions & { provider?: string }) {
    super(options);
    this.provider = options.provider || 'wispr_flow';
  }

  getIntegrationType(): string {
    return 'ambient_transcription';
  }

  getProvider(): string {
    return this.provider;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (this.useMock) {
      return {
        success: true,
        message: `Connected to ${this.provider} ambient transcription (mock mode)`,
      };
    }

    const credentials = this.getCredentials();
    const apiKey = this.getApiKey(credentials);
    if (!apiKey) {
      return {
        success: false,
        message: 'Missing Wispr Flow API key',
      };
    }

    try {
      await this.transcribeAudioBuffer(createSilentWavBuffer(), {
        filename: 'wispr-connection-test.wav',
        contentType: 'audio/wav',
        language: this.getLanguage(),
      });

      return {
        success: true,
        message: `Connected to ${this.provider} ambient transcription`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Wispr Flow connection failed',
      };
    }
  }

  async transcribeFile(audioFilePath: string): Promise<AmbientTranscriptionResult> {
    if (this.useMock) {
      return {
        text: 'Mock Wispr Flow transcript.',
        language: 'en',
        confidence: 0.8,
        segments: buildSegmentsFromText('Mock Wispr Flow transcript.', 0.8),
        source: 'mock',
      };
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
      return {
        text: 'Mock live Wispr transcript.',
        language: 'en',
        confidence: 0.75,
        segments: buildSegmentsFromText('Mock live Wispr transcript.', 0.75),
        source: 'mock',
      };
    }

    const extension = extensionForMimeType(mimeType);
    return this.transcribeAudioBuffer(audioBuffer, {
      filename: `live-chunk-${crypto.randomUUID()}${extension}`,
      contentType: mimeType || contentTypeForExtension(extension),
      language: this.getLanguage(),
    });
  }

  private getBaseUrl(): string {
    return String(
      this.config?.config?.baseUrl ||
      process.env.WISPR_FLOW_BASE_URL ||
      'https://api.wisprflow.ai'
    ).replace(/\/+$/, '');
  }

  private getTranscribePath(): string {
    return String(
      this.config?.config?.transcribePath ||
      process.env.WISPR_FLOW_TRANSCRIBE_PATH ||
      '/api/v1/voice-dictation/transcribe'
    );
  }

  private getLanguage(): string {
    return String(this.config?.config?.language || process.env.WISPR_FLOW_LANGUAGE || 'en');
  }

  private getApiKey(credentials: Record<string, any>): string | null {
    return credentials.apiKey ||
      credentials.api_key ||
      credentials.token ||
      process.env.WISPR_FLOW_API_KEY ||
      process.env.WISPR_API_KEY ||
      null;
  }

  private getWorkflowId(): string | null {
    const workflowId = this.config?.config?.workflowId ||
      this.config?.config?.workflow_id ||
      process.env.WISPR_FLOW_WORKFLOW_ID;
    return typeof workflowId === 'string' && workflowId.trim().length > 0 ? workflowId.trim() : null;
  }

  private getTranslateTo(): string | null {
    const translateTo = this.config?.config?.translateTo ||
      this.config?.config?.translate_to ||
      process.env.WISPR_FLOW_TRANSLATE_TO;
    return typeof translateTo === 'string' && translateTo.trim().length > 0 ? translateTo.trim() : null;
  }

  private async transcribeAudioBuffer(
    audioBuffer: Buffer,
    options: { filename: string; contentType: string; language?: string }
  ): Promise<AmbientTranscriptionResult> {
    const credentials = this.getCredentials();
    const apiKey = this.getApiKey(credentials);
    if (!apiKey) {
      throw new Error('Missing Wispr Flow API key');
    }

    const endpoint = `${this.getBaseUrl()}${this.getTranscribePath()}`;
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: options.filename,
      contentType: options.contentType,
    });
    formData.append('language', options.language || this.getLanguage());

    const workflowId = this.getWorkflowId();
    if (workflowId) {
      formData.append('workflowId', workflowId);
    }

    const translateTo = this.getTranslateTo();
    if (translateTo) {
      formData.append('translate_to', translateTo);
    }

    const startedAt = Date.now();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
          filename: options.filename,
          contentType: options.contentType,
          language: options.language || this.getLanguage(),
          workflowId: workflowId || undefined,
          translateTo: translateTo || undefined,
        },
        status: 'error',
        statusCode: response.status,
        errorMessage: errorText,
        durationMs,
      });
      throw new Error(`Wispr Flow transcription failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as WisprTranscriptionResponse;
    const text = String(payload.text || payload.transcript || '').trim();
    const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0.85;
    const segments = Array.isArray(payload.segments) && payload.segments.length > 0
      ? payload.segments
          .filter((segment) => typeof segment?.text === 'string' && segment.text.trim().length > 0)
          .map((segment, index) => ({
            speaker: segment.speaker || `speaker_${index === 0 ? 0 : 1}`,
            text: segment.text!.trim(),
            start: typeof segment.start === 'number' ? segment.start : index,
            end: typeof segment.end === 'number' ? segment.end : index + 1,
            confidence: typeof segment.confidence === 'number' ? segment.confidence : confidence,
          }))
      : buildSegmentsFromText(text, confidence);

    await this.logIntegration({
      direction: 'outbound',
      endpoint,
      method: 'POST',
      request: {
        filename: options.filename,
        contentType: options.contentType,
        language: options.language || this.getLanguage(),
        workflowId: workflowId || undefined,
        translateTo: translateTo || undefined,
      },
      response: {
        success: payload.success,
        workflowId: payload.workflowId,
        userId: payload.userId,
        performance_metrics: payload.performance_metrics,
        transcriptLength: text.length,
      },
      status: 'success',
      statusCode: response.status,
      durationMs,
    });

    return {
      text,
      language: String(payload.detected_language || payload.language || options.language || this.getLanguage() || 'en'),
      confidence,
      segments,
      source: 'wispr_flow',
    };
  }
}

export function createAmbientTranscriptionAdapter(
  tenantId: string,
  provider: string = 'wispr_flow',
  useMock: boolean = true
): AmbientTranscriptionAdapter {
  return new AmbientTranscriptionAdapter({
    tenantId,
    provider,
    useMock,
  });
}
