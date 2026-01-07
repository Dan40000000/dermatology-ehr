import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { saveFileLocal, saveFile } from '../storage';
import { scanBuffer } from '../virusScan';
import { putObject } from '../s3';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock('../virusScan', () => ({
  scanBuffer: jest.fn(),
}));

jest.mock('../s3', () => ({
  putObject: jest.fn(),
}));

const existsSyncMock = fs.existsSync as jest.Mock;
const mkdirSyncMock = fs.mkdirSync as jest.Mock;
const writeFileMock = (fs.promises.writeFile as unknown) as jest.Mock;
const scanBufferMock = scanBuffer as jest.Mock;
const putObjectMock = putObject as jest.Mock;

describe('storage service', () => {
  const originalEnv = { ...env };

  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    writeFileMock.mockReset();
    scanBufferMock.mockReset();
    putObjectMock.mockReset();
    Object.assign(env, originalEnv);
  });

  it('saves files locally with deterministic naming', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456);
    existsSyncMock.mockReturnValue(false);
    writeFileMock.mockResolvedValue(undefined);

    const file = {
      buffer: Buffer.from('data'),
      originalname: 'file.txt',
    } as Express.Multer.File;

    const result = await saveFileLocal(file);

    const safeName = '1234-123456-file.txt';
    const expectedPath = path.join(process.cwd(), 'uploads', safeName);
    expect(mkdirSyncMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(expectedPath, file.buffer);
    expect(result).toEqual({
      url: `/uploads/${safeName}`,
      storage: 'local',
      objectKey: safeName,
    });

    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('rejects files that fail virus scan', async () => {
    scanBufferMock.mockResolvedValueOnce(false);
    const file = {
      buffer: Buffer.from('data'),
      originalname: 'file.txt',
    } as Express.Multer.File;

    await expect(saveFile(file)).rejects.toThrow('File failed virus scan');
  });

  it('uploads to s3 when configured', async () => {
    env.storageProvider = 's3';
    env.s3Bucket = 'bucket';
    scanBufferMock.mockResolvedValueOnce(true);
    putObjectMock.mockResolvedValueOnce({ key: 'object-key', signedUrl: 'https://s3.local/file' });

    const file = {
      buffer: Buffer.from('data'),
      originalname: 'file.txt',
      mimetype: 'text/plain',
    } as Express.Multer.File;

    const result = await saveFile(file);

    expect(putObjectMock).toHaveBeenCalledWith(file.buffer, 'text/plain', 'file.txt');
    expect(result).toEqual({
      url: 'https://s3.local/file',
      storage: 's3',
      objectKey: 'object-key',
    });
  });
});
