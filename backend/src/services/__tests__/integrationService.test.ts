import { pool } from '../../db/pool';
import { getIntegrationConfig } from '../../integrations/baseAdapter';
import { createAmbientTranscriptionAdapter } from '../../integrations/ambientTranscriptionAdapter';
import { IntegrationService } from '../integrationService';

jest.mock('../../db/pool', () => ({
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  },
}));

jest.mock('../../integrations/baseAdapter', () => {
  const actual = jest.requireActual('../../integrations/baseAdapter');
  return {
    ...actual,
    getIntegrationConfig: jest.fn(),
  };
});

jest.mock('../../integrations/ambientTranscriptionAdapter', () => {
  const actual = jest.requireActual('../../integrations/ambientTranscriptionAdapter');
  return {
    ...actual,
    createAmbientTranscriptionAdapter: jest.fn(actual.createAmbientTranscriptionAdapter),
  };
});

describe('IntegrationService ambient transcription gate', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
    process.env.AMBIENT_TRANSCRIPTION_PROVIDER = 'mock';
    process.env.ABRIDGE_API_KEY = 'live-abridge-key';
    process.env.ABRIDGE_BAA_ENABLED = 'true';
    process.env.ABRIDGE_API_CALLS_ENABLED = 'true';
    process.env.EXTERNAL_AI_API_CALLS_ENABLED = 'true';

    (getIntegrationConfig as jest.Mock).mockResolvedValue({
      id: 'ambient-config-live-under-kill-switch',
      tenantId: 'tenant-123',
      integrationType: 'ambient_transcription',
      provider: 'abridge',
      config: { environment: 'production' },
      credentialsEncrypted: 'encrypted-db-credential',
      isActive: true,
      syncFrequencyMinutes: 60,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AMBIENT_TRANSCRIPTION_PROVIDER;
    delete process.env.ABRIDGE_API_KEY;
    delete process.env.ABRIDGE_BAA_ENABLED;
    delete process.env.ABRIDGE_API_CALLS_ENABLED;
    delete process.env.EXTERNAL_AI_API_CALLS_ENABLED;
  });

  it('keeps status and connection tests in mock mode over an active database provider', async () => {
    const service = new IntegrationService('tenant-123', false);

    const result = await service.testConnection('ambient_transcription');

    expect(result).toEqual({
      success: true,
      message: 'Connected to Abridge ambient transcription (mock mode)',
    });
    expect(createAmbientTranscriptionAdapter).toHaveBeenCalledWith(
      'tenant-123',
      'mock',
      true
    );
    expect(getIntegrationConfig).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('replaces a cached live adapter when the deployment kill switch becomes explicit', async () => {
    delete process.env.AMBIENT_TRANSCRIPTION_PROVIDER;
    (getIntegrationConfig as jest.Mock).mockResolvedValueOnce(null);
    const service = new IntegrationService('tenant-123', false);

    await service.getAmbientTranscriptionAdapter();
    process.env.AMBIENT_TRANSCRIPTION_PROVIDER = 'mock';
    const result = await service.testConnection('ambient_transcription');

    expect(result.success).toBe(true);
    expect(result.message).toContain('mock mode');
    expect(createAmbientTranscriptionAdapter).toHaveBeenLastCalledWith(
      'tenant-123',
      'mock',
      true
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
