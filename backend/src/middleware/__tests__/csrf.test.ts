const csrfMock = jest.fn((options) => options);

jest.mock('csurf', () => ({
  __esModule: true,
  default: csrfMock,
}));

const loadProtection = () => {
  let mod: typeof import('../csrf');
  jest.isolateModules(() => {
    mod = require('../csrf');
  });
  return mod!.csrfProtection as any;
};

describe('csrfProtection', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  it('sets secure cookie in production', () => {
    process.env.NODE_ENV = 'production';
    const protection = loadProtection();

    expect(protection.cookie.httpOnly).toBe(true);
    expect(protection.cookie.secure).toBe(true);
    expect(protection.cookie.sameSite).toBe('strict');
  });

  it('sets non-secure cookie outside production', () => {
    process.env.NODE_ENV = 'development';
    const protection = loadProtection();

    expect(protection.cookie.secure).toBe(false);
  });
});
