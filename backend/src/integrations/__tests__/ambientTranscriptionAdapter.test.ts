import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import jwt from 'jsonwebtoken';
import {
  AmbientTranscriptionAdapter,
  hasAmbientTranscriptionCredentials,
  resolveAmbientTranscriptionProviderFromEnv,
} from '../ambientTranscriptionAdapter';

const mockedS3Send = jest.fn();
const mockedTranscribeSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockedS3Send })),
  PutObjectCommand: jest.fn((input) => ({ input })),
  GetObjectCommand: jest.fn((input) => ({ input })),
}));

jest.mock('@aws-sdk/client-transcribe', () => ({
  TranscribeClient: jest.fn().mockImplementation(() => ({ send: mockedTranscribeSend })),
  StartMedicalScribeJobCommand: jest.fn((input) => ({ input })),
  GetMedicalScribeJobCommand: jest.fn((input) => ({ input })),
}));

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  },
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('AmbientTranscriptionAdapter providers', () => {
  let mockedFetch: jest.Mock;

  beforeAll(() => {
    global.fetch = jest.fn() as typeof fetch;
    mockedFetch = global.fetch as unknown as jest.Mock;
  });

  beforeEach(() => {
    delete process.env.AMBIENT_TRANSCRIPTION_PROVIDER;
    delete process.env.ABRIDGE_API_KEY;
    delete process.env.ABRIDGE_ACCESS_TOKEN;
    delete process.env.ABRIDGE_TOKEN;
    delete process.env.WISPR_FLOW_API_KEY;
    delete process.env.WISPR_API_KEY;
    delete process.env.WISPR_FLOW_WORKFLOW_ID;
    delete process.env.WISPR_FLOW_TRANSLATE_TO;
    delete process.env.NABLA_SERVER_ACCESS_TOKEN;
    delete process.env.NABLA_ACCESS_TOKEN;
    delete process.env.NABLA_CLIENT_ID;
    delete process.env.NABLA_PRIVATE_KEY;
    delete process.env.NABLA_PRIVATE_KEY_PEM;
    delete process.env.AWS_HEALTHSCRIBE_INPUT_BUCKET;
    delete process.env.AWS_HEALTHSCRIBE_OUTPUT_BUCKET;
    delete process.env.AWS_HEALTHSCRIBE_DATA_ACCESS_ROLE_ARN;

    mockedFetch.mockReset();
    mockedS3Send.mockReset();
    mockedTranscribeSend.mockReset();
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        transcript: 'Patient reports a changing pigmented lesion.',
        workflowId: 'workflow-123',
        userId: 'user-123',
        performance_metrics: {
          total_time: 1.2,
          transcription_time: 0.8,
        },
      }),
    } as Response);
  });

  function createWisprAdapter(): AmbientTranscriptionAdapter {
    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'wispr_flow',
      config: {
        id: 'cfg-1',
        tenantId: 'tenant-demo',
        integrationType: 'ambient_transcription',
        provider: 'wispr_flow',
        config: {
          baseUrl: 'https://api.wisprflow.ai',
          transcribePath: '/api/v1/voice-dictation/transcribe',
          language: 'en',
          workflowId: 'workflow-123',
          translateTo: 'es',
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      apiKey: 'wispr-test-key',
    });

    return adapter;
  }

  it('uploads live audio chunks to the official Wispr multipart endpoint', async () => {
    const adapter = createWisprAdapter();

    const result = await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    expect(result).toMatchObject({
      text: 'Patient reports a changing pigmented lesion.',
      language: 'en',
      source: 'wispr_flow',
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockedFetch.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: Buffer }
    ];

    expect(url).toBe('https://api.wisprflow.ai/api/v1/voice-dictation/transcribe');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer wispr-test-key');
    expect(options.headers['content-type']).toContain('multipart/form-data');
    expect(Buffer.isBuffer(options.body)).toBe(true);

    const body = options.body.toString('utf8');
    expect(body).toContain('name="file"; filename="live-chunk-');
    expect(body).toContain('Content-Type: audio/webm');
    expect(body).toContain('name="language"');
    expect(body).toContain('en');
    expect(body).toContain('name="workflowId"');
    expect(body).toContain('workflow-123');
    expect(body).toContain('name="translate_to"');
    expect(body).toContain('es');
  });

  it('supports provider-specific Abridge request and response mapping', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          transcript: 'Abridge partner transcript.',
          language: 'en',
          utterances: [
            {
              speaker: 'clinician',
              transcript: 'Abridge partner transcript.',
              start: 0,
              end: 4,
              confidence: 0.91,
            },
          ],
        },
      }),
    } as Response);

    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'abridge',
      config: {
        id: 'cfg-abridge',
        tenantId: 'tenant-demo',
        integrationType: 'ambient_transcription',
        provider: 'abridge',
        config: {
          baseUrl: 'https://api.abridge.example',
          transcribePath: '/v1/transcriptions',
          language: 'en',
          fileFieldName: 'audio',
          languageFieldName: 'locale',
          responseTextPath: 'data.transcript',
          responseLanguagePath: 'data.language',
          responseSegmentsPath: 'data.utterances',
          segmentTextField: 'transcript',
          segmentSpeakerField: 'speaker',
          segmentStartField: 'start',
          segmentEndField: 'end',
          segmentConfidenceField: 'confidence',
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      apiKey: 'abridge-test-key',
    });

    const result = await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    expect(result).toMatchObject({
      text: 'Abridge partner transcript.',
      language: 'en',
      source: 'abridge',
    });
    expect(result.segments[0]).toMatchObject({
      speaker: 'clinician',
      text: 'Abridge partner transcript.',
      start: 0,
      end: 4,
      confidence: 0.91,
    });
  });

  it('supports Nabla OAuth token exchange and transcript segments', async () => {
    jest.spyOn(jwt, 'sign').mockReturnValue('signed-nabla-assertion' as any);
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'nabla-server-token',
          expires_in: 3600,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          transcript: [
            {
              text: 'Patient reports scalp itching.',
              speaker: 'patient',
              start_offset_ms: 0,
              end_offset_ms: 1200,
              confidence: 0.93,
            },
            {
              text: 'Exam shows flaky plaques on the scalp.',
              speaker: 'doctor',
              start_offset_ms: 1300,
              end_offset_ms: 2600,
              confidence: 0.91,
            },
          ],
        }),
      } as Response);

    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'nabla',
      config: {
        id: 'cfg-nabla',
        tenantId: 'tenant-demo',
        integrationType: 'ambient_transcription',
        provider: 'nabla',
        config: {
          baseUrl: 'https://us.api.nabla.com',
          tokenPath: '/oauth/token',
          transcribePath: '/v1/core/server/transcribe',
          apiVersion: '2025-05-21',
          requestParameters: {
            speech_locale: 'ENGLISH_US',
            split_by_sentence: true,
          },
          responseSegmentsPath: 'transcript',
          segmentTextField: 'text',
          segmentSpeakerField: 'speaker',
          segmentStartField: 'start_offset_ms',
          segmentEndField: 'end_offset_ms',
          segmentTimeUnit: 'milliseconds',
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      clientId: 'nabla-client-id',
      privateKeyPem: `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC2L1QqjLzMcz7a\nhTw9ivfLNXoMxuJrRVkOqYWjPnHss03LyIbPXyN9yX0A4J8dM+Kc+SioylAtdM3A\n2lpfqHqc1eVQ9sVx8etNw1QBo2Q1HhZv86ve1xJvu0W2R1pSjGEZWp55arHso5qB\nSM23xvQqDtwV2SoWJ5l4m38PyTl9+0g7pKMoX67CM1gac3GTXlGHbyd4vZ2aXQOx\nxXvz+uWl9YgQ4rD9rKYfM3Q4f2mniC4Mri0YDx38IhAHX39I3dIuYjGZq6dJ7akz\nqUEVm8+iwm7x2N1N4qYx0k+btE58yQp3Rlyd6pE8vW5wnx2M1nQ7U9ev9l5vb1Yo\nmE4ozixFAgMBAAECggEABf7e02lIuKTF5C0+zr4OW7qVhE0NLC4PTq7VbfvHGAda\nG1JW60i80QpOMWItCGz9IMfcKfzdS9pRq2O3gkCNmTyA7cLhKnYQMz18W1e8t1/Y\nVVk8C6s7GaQj56jJ6qF7Xdsm4iYx4x0mvyQOzoGgFi8gdpNEQ7sktTb0s1QGx8CO\nRKgFXAZA8k95GXxVvoI0hP4QpJ9cKQz5hM4+EAa1k+2hTFYmbdBqu4k7Y1vhArDN\n9qQ+Pif9dZyM2D47mEJ/2NyH7wqj2jE3TjAaCVB3nG2+YvVT8ACk6NJWl7drmLxP\nYJbOW0jI3cgt5+2M+MoDc3iT59dX3y4H+5M0y6IfMQKBgQDniBgC5f4n0eX+JMLN\n0vJ2QpC8v10LqnEjsJkv0Yq6clLJwW6LiG9ifh+q+1n61w7h4bWNTL2dlc2SYwF6\nKoM+9geQyd/V7JY4w0s1VMP7c9s6fLQv5rYkXUqN1v7M1jCgDQfgtFdbxjBzWdtg\n+/MMixx9Q4z0uV3Haf3Xo1SxvQKBgQDJpoE2xI64lcJwD/Zs/Mv0qv9Wdg7m2w0r\n0SLPybdX1oigSM8Md7mLzQcfw4+cjWL63eRffnQKe0pI+uU1coAc+s6br35iz4tD\nC7uUt9PpJDEgVybq2Q5k+Hj9D1pkcFzBR4ZCAU0N7NFuhwM5jHvhGx5jY3F5iNNf\n9uB0N4lTdwKBgB3c5K4s4cxPWLxPbU8fOFJ0PTgG8xeCe9JdoM2mw0WZJ5EsO7R0\n2lP2gEL2q0Qt60L7aAoYIeiG6Ifm5Y7r6Iuy+ZIpjzFRyXnN8jU6kbsR+8mPx9U2\n9/3SWFTjU+FB8E4Q2wQbrW1rTWY1z5X+Qm8cFIf1XyiA+VJ5vNQCbwQ1AoGAK96A\nE6X47Asr6h6F/8fnPQoioWBa6yK1Oc/Gwv4UYd4KMSgI2R+yn7LNEu+RxCW8Wl3D\nTev2MUtGbMebYVuKn3xP3VEVTvL+0mc6XUz7ho9eqH4AD3r+R8rKBiqxC8l3LtcQ\nj6dxTQk6p/BVccNZ0iFYmRNgv5gdrLxQ+Em5DUUCgYAe1AQ+8b2KSK72t+J5P9m6\nlyW6R9rBzM1LJqV0BHWuJxY9X6X2fvz95VyoDkEr9/6M+qZxHhLeWQnNYp0aV6t7\nyX0PAp08+8m3gM6gLG7KPthm8YJXXif6o0C00x0b4QGax+Zx7TMpwlKh4I0wRrQy\n8lKQv8LvvE6ko0B9wQ==\n-----END PRIVATE KEY-----`,
    });

    const result = await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    expect(result.source).toBe('nabla');
    expect(result.text).toContain('Patient reports scalp itching.');
    expect(result.text).toContain('Exam shows flaky plaques on the scalp.');
    expect(result.segments[0]).toMatchObject({
      speaker: 'patient',
      text: 'Patient reports scalp itching.',
      start: 0,
      end: 1.2,
    });

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const [tokenUrl] = mockedFetch.mock.calls[0] as [string, Record<string, any>];
    const [transcribeUrl, transcribeOptions] = mockedFetch.mock.calls[1] as [string, { headers: Record<string, string>; body: Buffer }];
    expect(tokenUrl).toBe('https://us.api.nabla.com/oauth/token');
    expect(transcribeUrl).toBe('https://us.api.nabla.com/v1/core/server/transcribe');
    expect(transcribeOptions.headers.Authorization).toBe('Bearer nabla-server-token');
    expect(transcribeOptions.headers['X-Nabla-Api-Version']).toBe('2025-05-21');
    expect(transcribeOptions.body.toString('utf8')).toContain('name="request_parameters"');
    expect(transcribeOptions.body.toString('utf8')).toContain('ENGLISH_US');
  });

  it('supports AWS HealthScribe batch transcription for recorded encounters', async () => {
    mockedS3Send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: Readable.from([
          JSON.stringify({
            Conversation: {
              TranscriptSegments: [
                {
                  Content: 'Patient reports scalp itching.',
                  ParticipantRole: 'PATIENT',
                  BeginOffsetMillis: 0,
                  EndOffsetMillis: 1500,
                  Confidence: 0.94,
                },
                {
                  Content: 'Plan ketoconazole shampoo twice weekly.',
                  ParticipantRole: 'CLINICIAN',
                  BeginOffsetMillis: 1600,
                  EndOffsetMillis: 3400,
                  Confidence: 0.92,
                },
              ],
            },
          }),
        ]),
      });
    mockedTranscribeSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        MedicalScribeJob: {
          MedicalScribeJobStatus: 'COMPLETED',
          MedicalScribeOutput: {
            TranscriptFileUri: 'https://s3.us-east-1.amazonaws.com/demo-output/healthscribe/transcript.json',
            ClinicalDocumentUri: 'https://s3.us-east-1.amazonaws.com/demo-output/healthscribe/clinical-note.json',
          },
        },
      });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambient-aws-'));
    const audioPath = path.join(tempDir, 'recording.wav');
    fs.writeFileSync(audioPath, Buffer.from('fake-wav'));

    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'aws_healthscribe',
      config: {
        id: 'cfg-aws',
        tenantId: 'tenant-demo',
        integrationType: 'ambient_transcription',
        provider: 'aws_healthscribe',
        config: {
          region: 'us-east-1',
          inputBucket: 'demo-input',
          outputBucket: 'demo-output',
          dataAccessRoleArn: 'arn:aws:iam::123456789012:role/demo-healthscribe-role',
          inputPrefix: 'healthscribe/input',
          outputPrefix: 'healthscribe/output',
          noteTemplate: 'PHYSICAL_SOAP',
          showSpeakerLabels: true,
          maxSpeakerLabels: 2,
          pollIntervalMs: 1,
          timeoutMs: 2000,
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });

    const result = await adapter.transcribeFile(audioPath);

    expect(result.source).toBe('aws_healthscribe');
    expect(result.text).toContain('Patient reports scalp itching.');
    expect(result.text).toContain('Plan ketoconazole shampoo twice weekly.');
    expect(result.segments[0]).toMatchObject({
      speaker: 'PATIENT',
      start: 0,
      end: 1.5,
    });
    expect(adapter.supportsLiveChunks()).toBe(false);
  });

  it('uses a HealthScribe connection test sample longer than the AWS minimum', async () => {
    mockedS3Send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: Readable.from([
          JSON.stringify({
            Conversation: {
              TranscriptSegments: [
                {
                  Content: 'Connection test transcript.',
                  ParticipantRole: 'CLINICIAN',
                  BeginOffsetMillis: 0,
                  EndOffsetMillis: 800,
                  Confidence: 0.95,
                },
              ],
            },
          }),
        ]),
      });
    mockedTranscribeSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        MedicalScribeJob: {
          MedicalScribeJobStatus: 'COMPLETED',
          MedicalScribeOutput: {
            TranscriptFileUri: 's3://demo-output/healthscribe/transcript.json',
          },
        },
      });

    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'aws_healthscribe',
      config: {
        id: 'cfg-aws',
        tenantId: 'tenant-demo',
        integrationType: 'ambient_transcription',
        provider: 'aws_healthscribe',
        config: {
          region: 'us-east-1',
          inputBucket: 'demo-input',
          outputBucket: 'demo-output',
          dataAccessRoleArn: 'arn:aws:iam::123456789012:role/demo-healthscribe-role',
          pollIntervalMs: 1,
          timeoutMs: 2000,
        },
        credentialsEncrypted: '',
        isActive: true,
        syncFrequencyMinutes: 60,
      } as any,
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });

    const result = await adapter.testConnection();

    expect(result).toEqual({
      success: true,
      message: 'Connected to AWS HealthScribe ambient transcription',
    });

    const putObjectCall = mockedS3Send.mock.calls[0]?.[0];
    const uploadedBody = putObjectCall?.input?.Body as Buffer;
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    const sampleRate = uploadedBody.readUInt32LE(24);
    const dataSize = uploadedBody.readUInt32LE(40);
    const durationSeconds = dataSize / (sampleRate * 2);
    expect(durationSeconds).toBeGreaterThanOrEqual(0.5);
  });

  it('reports missing credentials before calling a live provider', async () => {
    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'wispr_flow',
    });

    jest.spyOn<any, any>(adapter as any, 'getCredentials').mockReturnValue({});

    await expect(
      adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm')
    ).rejects.toThrow('Missing Wispr Flow API key');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('uses environment variables for Wispr credentials and optional fields', async () => {
    process.env.WISPR_FLOW_API_KEY = 'env-wispr-key';
    process.env.WISPR_FLOW_WORKFLOW_ID = 'env-workflow';
    process.env.WISPR_FLOW_TRANSLATE_TO = 'fr';

    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: false,
      provider: 'wispr_flow',
    });

    await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    const [, options] = mockedFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: Buffer }
    ];
    expect(options.headers.Authorization).toBe('Bearer env-wispr-key');
    expect(options.body.toString('utf8')).toContain('env-workflow');
    expect(options.body.toString('utf8')).toContain('fr');
  });

  it('keeps mock mode usable for demos without provider credentials', async () => {
    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: true,
      provider: 'abridge',
    });

    const result = await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    expect(result).toMatchObject({
      text: 'Mock live Abridge transcript.',
      source: 'mock',
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('resolves the ambient provider from explicit env or available credentials', () => {
    process.env.AMBIENT_TRANSCRIPTION_PROVIDER = 'nabla';
    expect(resolveAmbientTranscriptionProviderFromEnv()).toBe('nabla');

    delete process.env.AMBIENT_TRANSCRIPTION_PROVIDER;
    process.env.ABRIDGE_API_KEY = 'abridge-key';
    expect(resolveAmbientTranscriptionProviderFromEnv()).toBe('abridge');

    delete process.env.ABRIDGE_API_KEY;
    process.env.NABLA_CLIENT_ID = 'nabla-client-id';
    process.env.NABLA_PRIVATE_KEY = 'fake-key';
    expect(resolveAmbientTranscriptionProviderFromEnv()).toBe('nabla');

    delete process.env.NABLA_CLIENT_ID;
    delete process.env.NABLA_PRIVATE_KEY;
    process.env.AWS_HEALTHSCRIBE_INPUT_BUCKET = 'demo-input';
    process.env.AWS_HEALTHSCRIBE_OUTPUT_BUCKET = 'demo-output';
    process.env.AWS_HEALTHSCRIBE_DATA_ACCESS_ROLE_ARN = 'arn:aws:iam::123456789012:role/demo';
    expect(resolveAmbientTranscriptionProviderFromEnv()).toBe('aws_healthscribe');

    delete process.env.AWS_HEALTHSCRIBE_INPUT_BUCKET;
    delete process.env.AWS_HEALTHSCRIBE_OUTPUT_BUCKET;
    delete process.env.AWS_HEALTHSCRIBE_DATA_ACCESS_ROLE_ARN;
    process.env.WISPR_FLOW_API_KEY = 'wispr-key';
    expect(resolveAmbientTranscriptionProviderFromEnv()).toBe('wispr_flow');
  });

  it('detects whether provider credentials exist in the environment', () => {
    expect(hasAmbientTranscriptionCredentials('abridge')).toBe(false);
    process.env.ABRIDGE_API_KEY = 'abridge-key';
    expect(hasAmbientTranscriptionCredentials('abridge')).toBe(true);

    expect(hasAmbientTranscriptionCredentials('nabla')).toBe(false);
    process.env.NABLA_CLIENT_ID = 'nabla-client-id';
    process.env.NABLA_PRIVATE_KEY = 'fake-key';
    expect(hasAmbientTranscriptionCredentials('nabla')).toBe(true);

    expect(hasAmbientTranscriptionCredentials('aws_healthscribe')).toBe(false);
    process.env.AWS_HEALTHSCRIBE_INPUT_BUCKET = 'demo-input';
    process.env.AWS_HEALTHSCRIBE_OUTPUT_BUCKET = 'demo-output';
    process.env.AWS_HEALTHSCRIBE_DATA_ACCESS_ROLE_ARN = 'arn:aws:iam::123456789012:role/demo';
    expect(hasAmbientTranscriptionCredentials('aws_healthscribe')).toBe(true);

    expect(hasAmbientTranscriptionCredentials('wispr_flow')).toBe(false);
    process.env.WISPR_FLOW_API_KEY = 'wispr-key';
    expect(hasAmbientTranscriptionCredentials('wispr_flow')).toBe(true);
  });
});
