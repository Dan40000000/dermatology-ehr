import sharp from 'sharp';
import {
  validateSignatureData,
  saveSignature,
  saveInsuranceCardPhoto,
} from '../signatureService';
import { logger } from '../../lib/logger';
import { saveFileLocal } from '../storage';
import { scanBuffer } from '../virusScan';

jest.mock('../storage', () => ({
  saveFileLocal: jest.fn(),
}));

jest.mock('../virusScan', () => ({
  scanBuffer: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('sharp', () =>
  jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumb')),
  }))
);

const saveFileLocalMock = saveFileLocal as jest.Mock;
const scanBufferMock = scanBuffer as jest.Mock;
const sharpMock = sharp as unknown as jest.Mock;
const loggerMock = logger as jest.Mocked<typeof logger>;

const makeDataUrl = (mime = 'image/png', content = 'a'.repeat(200)) =>
  `data:${mime};base64,${Buffer.from(content).toString('base64')}`;

describe('signatureService', () => {
  beforeEach(() => {
    saveFileLocalMock.mockReset();
    scanBufferMock.mockReset();
    sharpMock.mockClear();
    loggerMock.error.mockReset();
  });

  it('validates signature data inputs', () => {
    expect(validateSignatureData('')).toBe(false);
    expect(validateSignatureData('data:text/plain;base64,abc')).toBe(false);
    expect(validateSignatureData('data:image/png;base64,short')).toBe(false);
    expect(validateSignatureData(makeDataUrl())).toBe(true);
  });

  it('rejects invalid signature data on save', async () => {
    await expect(saveSignature('bad', 'patient-1')).rejects.toThrow('Invalid signature data');
  });

  it('blocks signatures that fail security scan', async () => {
    scanBufferMock.mockResolvedValueOnce(false);

    await expect(saveSignature(makeDataUrl(), 'patient-1')).rejects.toThrow(
      'Signature failed security scan'
    );
  });

  it('saves signatures with thumbnails', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    saveFileLocalMock
      .mockResolvedValueOnce({ url: 'original', storage: 'local', objectKey: 'orig' })
      .mockResolvedValueOnce({ url: 'thumb', storage: 'local', objectKey: 'thumb' });

    const result = await saveSignature(makeDataUrl(), 'patient-1');

    expect(saveFileLocalMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      url: 'original',
      thumbnailUrl: 'thumb',
      storage: 'local',
      objectKey: 'orig',
    });
  });

  it('saves svg signatures without thumbnails', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    saveFileLocalMock.mockResolvedValueOnce({ url: 'svg', storage: 'local', objectKey: 'svg' });

    const result = await saveSignature(makeDataUrl('image/svg+xml'), 'patient-1');

    expect(saveFileLocalMock).toHaveBeenCalledTimes(1);
    expect(result.thumbnailUrl).toBeUndefined();
  });

  it('continues when thumbnail generation fails', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    saveFileLocalMock.mockResolvedValueOnce({ url: 'original', storage: 'local', objectKey: 'orig' });
    sharpMock.mockImplementationOnce(() => ({
      resize: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValueOnce(new Error('fail')),
    }));

    await expect(saveSignature(makeDataUrl(), 'patient-1')).resolves.toEqual({
      url: 'original',
      thumbnailUrl: undefined,
      storage: 'local',
      objectKey: 'orig',
    });
    expect(loggerMock.error).toHaveBeenCalledWith('Error generating signature thumbnail:', {
      error: 'fail',
    });
  });

  it('validates insurance card format', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    await expect(
      saveInsuranceCardPhoto('bad', 'patient-1', 'front')
    ).rejects.toThrow('Invalid insurance card photo format');
  });

  it('rejects insurance cards that fail security scan', async () => {
    scanBufferMock.mockResolvedValueOnce(false);
    await expect(
      saveInsuranceCardPhoto(makeDataUrl('image/jpeg'), 'patient-1', 'front')
    ).rejects.toThrow('Insurance card photo failed security scan');
  });

  it('saves insurance card photos with thumbnails', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    saveFileLocalMock
      .mockResolvedValueOnce({ url: 'photo', storage: 'local', objectKey: 'photo' })
      .mockResolvedValueOnce({ url: 'thumb', storage: 'local', objectKey: 'thumb' });

    const result = await saveInsuranceCardPhoto(makeDataUrl('image/jpeg'), 'patient-1', 'front');

    expect(saveFileLocalMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      url: 'photo',
      thumbnailUrl: 'thumb',
      storage: 'local',
      objectKey: 'photo',
    });
  });

  it('masks non-Error insurance thumbnail failures', async () => {
    scanBufferMock.mockResolvedValueOnce(true);
    saveFileLocalMock.mockResolvedValueOnce({ url: 'photo', storage: 'local', objectKey: 'photo' });
    sharpMock.mockImplementationOnce(() => ({
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockRejectedValueOnce({ reason: 'bad image' }),
    }));

    const result = await saveInsuranceCardPhoto(makeDataUrl('image/jpeg'), 'patient-1', 'back');

    expect(result.thumbnailUrl).toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalledWith('Error generating insurance card thumbnail:', {
      error: 'Unknown error',
    });
  });
});
