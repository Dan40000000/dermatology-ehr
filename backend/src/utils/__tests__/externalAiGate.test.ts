import {
  getEnabledAnthropicApiKey,
  getEnabledOpenAiApiKey,
  isClinicalAiProviderCallsEnabled,
  isAnthropicApiCallsEnabled,
  isOpenAiApiCallsEnabled,
} from '../externalAiGate';

describe('externalAiGate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_CALLS_ENABLED;
    delete process.env.ANTHROPIC_API_CALLS_ENABLED;
    delete process.env.EXTERNAL_AI_API_CALLS_ENABLED;
    delete process.env.ALLOW_EXTERNAL_AI_IN_TEST;
    delete process.env.ABRIDGE_API_CALLS_ENABLED;
    delete process.env.ABRIDGE_BAA_ENABLED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('hides real OpenAI keys unless API calls are explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.OPENAI_API_KEY = 'sk-real-looking-key';

    expect(isOpenAiApiCallsEnabled()).toBe(false);
    expect(getEnabledOpenAiApiKey()).toBeUndefined();

    process.env.OPENAI_API_CALLS_ENABLED = 'true';

    expect(isOpenAiApiCallsEnabled()).toBe(true);
    expect(getEnabledOpenAiApiKey()).toBe('sk-real-looking-key');
  });

  it('hides real Anthropic keys unless API calls are explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.ANTHROPIC_API_KEY = 'real-anthropic-key';

    expect(isAnthropicApiCallsEnabled()).toBe(false);
    expect(getEnabledAnthropicApiKey()).toBeUndefined();

    process.env.ANTHROPIC_API_CALLS_ENABLED = 'yes';

    expect(isAnthropicApiCallsEnabled()).toBe(true);
    expect(getEnabledAnthropicApiKey()).toBe('real-anthropic-key');
  });

  it('blocks real keys during unit tests even if provider flags are enabled', () => {
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'sk-real-looking-key';
    process.env.OPENAI_API_CALLS_ENABLED = 'true';

    expect(getEnabledOpenAiApiKey()).toBeUndefined();
  });

  it('allows fake test credentials so mocked unit tests can verify request shape', () => {
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';

    expect(getEnabledOpenAiApiKey()).toBe('test-openai-key');
    expect(getEnabledAnthropicApiKey()).toBe('mock-anthropic-key');
  });

  it('requires an explicit override to use real keys in tests', () => {
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'sk-real-looking-key';
    process.env.OPENAI_API_CALLS_ENABLED = 'true';
    process.env.ALLOW_EXTERNAL_AI_IN_TEST = 'true';

    expect(getEnabledOpenAiApiKey()).toBe('sk-real-looking-key');
  });

  it('requires both API-call enablement and BAA attestation for database-backed providers', () => {
    process.env.NODE_ENV = 'production';
    process.env.ABRIDGE_BAA_ENABLED = 'true';
    process.env.ABRIDGE_API_CALLS_ENABLED = 'false';

    expect(isClinicalAiProviderCallsEnabled('abridge')).toBe(false);

    process.env.ABRIDGE_API_CALLS_ENABLED = 'true';
    expect(isClinicalAiProviderCallsEnabled('abridge')).toBe(true);

    delete process.env.ABRIDGE_BAA_ENABLED;
    expect(isClinicalAiProviderCallsEnabled('abridge')).toBe(false);
  });
});
