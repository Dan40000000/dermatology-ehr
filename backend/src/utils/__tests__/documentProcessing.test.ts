import {
  generateThumbnail,
  extractTextOCR,
  isSignableDocument,
  generatePreviewUrl,
  getDocumentIcon,
  getCategoryBadgeColor,
  sanitizeFilename,
  isFileSecure,
} from '../documentProcessing';

describe('documentProcessing utilities', () => {
  it('handles thumbnail and OCR placeholders', async () => {
    await expect(generateThumbnail('/tmp/test.pdf', 'application/pdf')).resolves.toBeNull();
    await expect(generateThumbnail('/tmp/test.jpg', 'image/jpeg')).resolves.toBeNull();
    await expect(generateThumbnail('/tmp/test.txt', 'text/plain')).resolves.toBeNull();

    await expect(extractTextOCR('/tmp/test.pdf', 'application/pdf')).resolves.toBeNull();
    await expect(extractTextOCR('/tmp/test.jpg', 'image/jpeg')).resolves.toBeNull();
    await expect(extractTextOCR('/tmp/test.txt', 'text/plain')).resolves.toBeNull();
  });

  it('handles thumbnail and OCR errors gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(generateThumbnail('/tmp/test.jpg', null as any)).resolves.toBeNull();
    await expect(extractTextOCR('/tmp/test.jpg', null as any)).resolves.toBeNull();
    errorSpy.mockRestore();
  });

  it('detects signable documents', () => {
    expect(isSignableDocument('Consent Forms', 'application/pdf')).toBe(true);
    expect(isSignableDocument('Lab Results', 'application/pdf')).toBe(false);
    expect(isSignableDocument('Consent Forms', 'image/png')).toBe(false);
  });

  it('builds preview URLs', () => {
    expect(generatePreviewUrl('/doc.pdf', 'application/pdf', '/thumb.jpg')).toEqual({
      previewUrl: '/thumb.jpg',
      previewType: 'thumbnail',
    });

    expect(generatePreviewUrl('/image.jpg', 'image/jpeg')).toEqual({
      previewUrl: '/image.jpg',
      previewType: 'full',
    });

    expect(generatePreviewUrl('/doc.pdf', 'application/pdf')).toEqual({
      previewUrl: '/doc.pdf',
      previewType: 'viewer',
    });

    expect(generatePreviewUrl('/file.bin', 'application/octet-stream')).toEqual({
      previewUrl: '/file.bin',
      previewType: 'full',
    });
  });

  it('returns icons and badge colors', () => {
    expect(getDocumentIcon('application/pdf')).toBe('file-pdf');
    expect(getDocumentIcon('image/png')).toBe('file-image');
    expect(getDocumentIcon('application/unknown')).toBe('file');

    expect(getCategoryBadgeColor('Lab Results')).toBe('blue');
    expect(getCategoryBadgeColor('Other')).toBe('gray');
    expect(getCategoryBadgeColor('Unknown')).toBe('gray');
  });

  it('sanitizes filenames and checks file security', () => {
    expect(sanitizeFilename('../evil/file.pdf')).toBe('evilfile.pdf');
    expect(sanitizeFilename('my report.pdf')).toBe('my_report.pdf');

    expect(isFileSecure('script.exe', 'application/pdf')).toEqual({
      secure: false,
      reason: 'Executable files are not allowed',
    });

    expect(isFileSecure('photo.jpg', 'application/pdf')).toEqual({
      secure: false,
      reason: 'File extension does not match MIME type',
    });

    expect(isFileSecure('report.pdf', 'application/pdf')).toEqual({ secure: true });
  });
});
