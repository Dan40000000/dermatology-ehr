const sentryMock = {
  init: jest.fn(),
  setContext: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
};

const redactPHIMock = jest.fn((value: any) => ({ redacted: value }));
const redactErrorMock = jest.fn((error: Error) => new Error(`redacted:${error.message}`));
const isPHIFieldMock = jest.fn((key: string) => key.toLowerCase().includes('ssn'));

jest.mock('@sentry/node', () => sentryMock);
jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn(() => ({ name: 'profiling' })),
}));
jest.mock('../../utils/phiRedaction', () => ({
  redactPHI: redactPHIMock,
  redactError: redactErrorMock,
  isPHIField: isPHIFieldMock,
}));

const baseConfig = {
  monitoring: {
    sentryDsn: 'https://example.com/123',
    sentryEnvironment: 'test',
    sentryTracesSampleRate: 0.5,
  },
  isProduction: false,
  isTest: false,
};

const loadSentry = (overrides: Partial<typeof baseConfig> = {}) => {
  jest.resetModules();
  jest.doMock('../../config', () => ({
    __esModule: true,
    default: {
      ...baseConfig,
      ...overrides,
      monitoring: {
        ...baseConfig.monitoring,
        ...(overrides as any).monitoring,
      },
    },
  }));
  let mod: typeof import('../sentry');
  jest.isolateModules(() => {
    mod = require('../sentry');
  });
  return mod!;
};

describe('sentry helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips init when DSN is missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { initSentry } = await loadSentry({ monitoring: { sentryDsn: '' } });

    initSentry();

    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null in beforeSend for test environment', async () => {
    const { initSentry } = await loadSentry({ isTest: true });

    initSentry();
    const options = sentryMock.init.mock.calls[0][0];
    const beforeSend = options.beforeSend as (event: any, hint: any) => any;

    expect(beforeSend({ message: 'boom' }, {})).toBeNull();
  });

  it('redacts sensitive fields in beforeSend', async () => {
    const { initSentry } = await loadSentry();

    initSentry();
    const options = sentryMock.init.mock.calls[0][0];
    const beforeSend = options.beforeSend as (event: any, hint: any) => any;

    const event = {
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=123',
          'x-api-key': 'key',
        },
        query_string: 'patientId=123',
        data: { ssn: '123-45-6789' },
      },
      exception: {
        values: [
          {
            value: 'SSN 123-45-6789',
            stacktrace: {
              frames: [
                { vars: { ssn: '123-45-6789', safe: 'ok' } },
              ],
            },
          },
        ],
      },
      breadcrumbs: [{ message: 'SSN 123', data: { ssn: '123-45-6789' } }],
      contexts: { user: { ssn: '123-45-6789' } },
      extra: { ssn: '123-45-6789' },
    };

    const redacted = beforeSend(event, {});

    expect(redacted.request.headers.authorization).toBe('[Redacted]');
    expect(redacted.request.headers.cookie).toBe('[Redacted]');
    expect(redacted.request.headers['x-api-key']).toBe('[Redacted]');
    expect(redacted.request.query_string).toBe('[Redacted]');
    expect(redacted.request.data).toEqual({ redacted: { ssn: '123-45-6789' } });
    expect(redacted.exception.values[0].value).toBe('redacted:SSN 123-45-6789');
    expect(redacted.exception.values[0].stacktrace.frames[0].vars.ssn).toBe('[Redacted]');
    expect(redacted.breadcrumbs[0].message).toBe('redacted:SSN 123');
    expect(redacted.contexts.user).toEqual({ redacted: { ssn: '123-45-6789' } });
    expect(redacted.extra).toEqual({ redacted: { ssn: '123-45-6789' } });
  });

  it('captures exceptions with redacted context', async () => {
    const { captureException } = await loadSentry();

    captureException(new Error('boom'), { ssn: '123-45-6789' });

    expect(sentryMock.setContext).toHaveBeenCalledWith('custom', {
      redacted: { ssn: '123-45-6789' },
    });
    expect(sentryMock.captureException).toHaveBeenCalled();
    const capturedError = sentryMock.captureException.mock.calls[0][0];
    expect(capturedError.message).toBe('redacted:boom');
  });

  it('adds breadcrumbs with redaction', async () => {
    const { addBreadcrumb } = await loadSentry();

    addBreadcrumb('SSN 123', 'test', { ssn: '123-45-6789' });

    expect(sentryMock.addBreadcrumb).toHaveBeenCalledWith({
      message: 'redacted:SSN 123',
      category: 'test',
      level: 'info',
      data: { redacted: { ssn: '123-45-6789' } },
    });
  });

  it('passes messages and user context to sentry', async () => {
    const { captureMessage, setUser, clearUser } = await loadSentry();

    captureMessage('hello', 'warning');
    setUser({ id: 'user-1', email: 'user@example.com', role: 'admin' });
    clearUser();

    expect(sentryMock.captureMessage).toHaveBeenCalledWith('hello', 'warning');
    expect(sentryMock.setUser).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'user@example.com',
      role: 'admin',
    });
    expect(sentryMock.setUser).toHaveBeenCalledWith(null);
  });
});
