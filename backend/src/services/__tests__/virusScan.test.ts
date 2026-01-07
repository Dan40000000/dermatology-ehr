import net from 'net';
import { env } from '../../config/env';
import { scanBuffer } from '../virusScan';

type HandlerMap = Record<string, (...args: any[]) => void>;

let handlers: HandlerMap = {};

const createSocket = () => {
  handlers = {};
  return {
    destroyed: false,
    setTimeout: jest.fn((_ms, cb) => {
      handlers.timeout = cb;
    }),
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
    }),
    connect: jest.fn((_port, _host, cb) => {
      cb();
    }),
    write: jest.fn(),
    destroy: jest.fn(function () {
      this.destroyed = true;
    }),
  };
};

jest.mock('net', () => ({
  __esModule: true,
  default: {
    Socket: jest.fn(() => createSocket()),
  },
  Socket: jest.fn(() => createSocket()),
}));

describe('virusScan', () => {
  const originalEnv = { ...env };

  beforeEach(() => {
    Object.assign(env, originalEnv);
  });

  it('allows empty buffers', async () => {
    await expect(scanBuffer(Buffer.from(''))).resolves.toBe(true);
  });

  it('blocks EICAR test signatures', async () => {
    const buf = Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    await expect(scanBuffer(buf)).resolves.toBe(false);
  });

  it('falls back when ClamAV is unavailable', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    env.clamavHost = undefined;

    await expect(scanBuffer(Buffer.from('data'))).resolves.toBe(true);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns true when ClamAV returns OK', async () => {
    env.clamavHost = 'localhost';
    const promise = scanBuffer(Buffer.from('data'));

    handlers.data?.(Buffer.from('stream: OK'));
    handlers.close?.();

    await expect(promise).resolves.toBe(true);
  });

  it('returns false when ClamAV reports FOUND', async () => {
    env.clamavHost = 'localhost';
    const promise = scanBuffer(Buffer.from('data'));

    handlers.data?.(Buffer.from('stream: FOUND'));
    handlers.close?.();

    await expect(promise).resolves.toBe(false);
  });
});
