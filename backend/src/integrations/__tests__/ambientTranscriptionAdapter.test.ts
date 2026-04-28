import { AmbientTranscriptionAdapter } from '../ambientTranscriptionAdapter';

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

describe('AmbientTranscriptionAdapter Wispr Flow', () => {
  let mockedFetch: jest.Mock;

  beforeAll(() => {
    global.fetch = jest.fn() as typeof fetch;
    mockedFetch = global.fetch as unknown as jest.Mock;
  });

  beforeEach(() => {
    delete process.env.WISPR_FLOW_API_KEY;
    delete process.env.WISPR_API_KEY;
    delete process.env.WISPR_FLOW_WORKFLOW_ID;
    delete process.env.WISPR_FLOW_TRANSLATE_TO;
    mockedFetch.mockReset();
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

  function createLiveAdapter(): AmbientTranscriptionAdapter {
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
    const adapter = createLiveAdapter();

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

  it('reports missing credentials before calling Wispr', async () => {
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

  it('can read Wispr credentials and optional fields from environment variables', async () => {
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

    const body = options.body.toString('utf8');
    expect(body).toContain('name="workflowId"');
    expect(body).toContain('env-workflow');
    expect(body).toContain('name="translate_to"');
    expect(body).toContain('fr');
  });

  it('keeps mock mode usable for demos without a Wispr key', async () => {
    const adapter = new AmbientTranscriptionAdapter({
      tenantId: 'tenant-demo',
      useMock: true,
      provider: 'wispr_flow',
    });

    const result = await adapter.transcribeBuffer(Buffer.from('fake-webm'), 'audio/webm');

    expect(result).toMatchObject({
      text: 'Mock live Wispr transcript.',
      source: 'mock',
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
