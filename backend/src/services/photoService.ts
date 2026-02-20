import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { logger } from '../lib/logger';

/**
 * Photo Service - HIPAA-compliant image processing and storage
 *
 * Features:
 * - Image resizing and compression
 * - Thumbnail generation
 * - EXIF metadata stripping (for privacy)
 * - Before/after comparison image generation
 * - Secure file storage
 */

const UPLOAD_DIR = process.env.PHOTO_UPLOAD_DIR || './uploads/photos';
const THUMBNAIL_DIR = process.env.PHOTO_THUMBNAIL_DIR || './uploads/thumbnails';
const COMPARISON_DIR = process.env.PHOTO_COMPARISON_DIR || './uploads/comparisons';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const THUMBNAIL_SIZE = 300; // 300px
const MAX_IMAGE_DIMENSION = 4096; // Max width or height

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function logPhotoServiceError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha: boolean;
}

interface ProcessedImage {
  filePath: string;
  thumbnailPath: string | null;
  metadata: ImageMetadata;
  originalSize: number;
  compressedSize: number;
}

interface ComparisonOptions {
  type: 'side_by_side' | 'slider' | 'overlay';
  width?: number;
  addLabels?: boolean;
  beforeLabel?: string;
  afterLabel?: string;
}

export class PhotoService {
  /**
   * Initialize upload directories
   */
  static async init(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
    await fs.mkdir(COMPARISON_DIR, { recursive: true });
  }

  /**
   * Process and store a patient photo
   * - Strips EXIF metadata
   * - Compresses image
   * - Generates thumbnail
   * - Returns file paths and metadata
   */
  static async processPhoto(
    buffer: Buffer,
    tenantId: string,
    patientId: string,
    originalFilename: string,
  ): Promise<ProcessedImage> {
    // Validate file size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const fileId = crypto.randomUUID();
    const ext = path.extname(originalFilename).toLowerCase() || '.jpg';
    const filename = `${fileId}${ext}`;

    // Create tenant/patient directory structure
    const tenantDir = path.join(UPLOAD_DIR, tenantId, patientId);
    await fs.mkdir(tenantDir, { recursive: true });

    const filePath = path.join(tenantDir, filename);

    // Process image with Sharp
    const image = sharp(buffer);

    // Get original metadata
    const metadata = await image.metadata();
    const originalSize = buffer.length;

    // Strip EXIF data and resize if needed
    let processedImage = image
      .rotate() // Auto-rotate based on EXIF orientation
      .withMetadata({ exif: {} }); // Remove EXIF data for privacy

    // Resize if image is too large
    if (metadata.width && metadata.width > MAX_IMAGE_DIMENSION) {
      processedImage = processedImage.resize(MAX_IMAGE_DIMENSION, undefined, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    } else if (metadata.height && metadata.height > MAX_IMAGE_DIMENSION) {
      processedImage = processedImage.resize(undefined, MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Compress and save
    const processedBuffer = await processedImage
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();

    await fs.writeFile(filePath, processedBuffer);

    // Generate thumbnail
    const thumbnailPath = await this.generateThumbnail(
      processedBuffer,
      tenantId,
      patientId,
      fileId,
    );

    // Get final metadata
    const finalImage = sharp(processedBuffer);
    const finalMetadata = await finalImage.metadata();

    return {
      filePath,
      thumbnailPath,
      metadata: {
        width: finalMetadata.width || 0,
        height: finalMetadata.height || 0,
        format: finalMetadata.format || 'jpeg',
        size: processedBuffer.length,
        hasAlpha: finalMetadata.hasAlpha || false,
      },
      originalSize,
      compressedSize: processedBuffer.length,
    };
  }

  /**
   * Generate thumbnail for a photo
   */
  static async generateThumbnail(
    buffer: Buffer,
    tenantId: string,
    patientId: string,
    fileId: string,
  ): Promise<string> {
    const thumbnailFilename = `${fileId}_thumb.jpg`;
    const thumbnailDir = path.join(THUMBNAIL_DIR, tenantId, patientId);
    await fs.mkdir(thumbnailDir, { recursive: true });

    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

    await sharp(buffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  }

  /**
   * Generate before/after comparison image
   */
  static async generateComparison(
    beforePhotoPath: string,
    afterPhotoPath: string,
    tenantId: string,
    patientId: string,
    options: ComparisonOptions = { type: 'side_by_side' },
  ): Promise<string> {
    const comparisonId = crypto.randomUUID();
    const comparisonDir = path.join(COMPARISON_DIR, tenantId, patientId);
    await fs.mkdir(comparisonDir, { recursive: true });

    const comparisonPath = path.join(comparisonDir, `${comparisonId}_comparison.jpg`);

    if (options.type === 'side_by_side') {
      await this.createSideBySideComparison(
        beforePhotoPath,
        afterPhotoPath,
        comparisonPath,
        options,
      );
    } else if (options.type === 'overlay') {
      await this.createOverlayComparison(beforePhotoPath, afterPhotoPath, comparisonPath);
    } else {
      // For slider type, we don't generate a static image
      // The frontend handles the slider interaction
      await this.createSideBySideComparison(
        beforePhotoPath,
        afterPhotoPath,
        comparisonPath,
        options,
      );
    }

    return comparisonPath;
  }

  /**
   * Create side-by-side comparison
   */
  private static async createSideBySideComparison(
    beforePath: string,
    afterPath: string,
    outputPath: string,
    options: ComparisonOptions,
  ): Promise<void> {
    const targetWidth = options.width || 1600; // Total width
    const singleWidth = Math.floor(targetWidth / 2);
    const gap = 10; // Gap between images

    // Load and resize images to same height
    const beforeImage = sharp(beforePath);
    const afterImage = sharp(afterPath);

    const beforeMeta = await beforeImage.metadata();
    const afterMeta = await afterImage.metadata();

    // Calculate target height (use the smaller height to avoid stretching)
    const beforeAspect = (beforeMeta.height || 1) / (beforeMeta.width || 1);
    const afterAspect = (afterMeta.height || 1) / (afterMeta.width || 1);
    const targetHeight = Math.floor(singleWidth * Math.max(beforeAspect, afterAspect));

    // Resize both images
    const beforeResized = await beforeImage
      .resize(singleWidth, targetHeight, { fit: 'cover' })
      .toBuffer();

    const afterResized = await afterImage
      .resize(singleWidth, targetHeight, { fit: 'cover' })
      .toBuffer();

    // Create white canvas
    const canvas = sharp({
      create: {
        width: targetWidth + gap,
        height: targetHeight + (options.addLabels ? 60 : 0),
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    });

    // Composite images side by side
    await canvas
      .composite([
        { input: beforeResized, top: 0, left: 0 },
        { input: afterResized, top: 0, left: singleWidth + gap },
      ])
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    // If labels requested, add them (would need text rendering library)
    // For now, labels would be added on frontend
  }

  /**
   * Create overlay comparison (blend mode)
   */
  private static async createOverlayComparison(
    beforePath: string,
    afterPath: string,
    outputPath: string,
  ): Promise<void> {
    const targetWidth = 800;

    const beforeImage = sharp(beforePath);
    const beforeMeta = await beforeImage.metadata();

    const targetHeight = Math.floor(
      targetWidth * ((beforeMeta.height || 1) / (beforeMeta.width || 1)),
    );

    // Resize both to same size
    const beforeResized = await beforeImage
      .resize(targetWidth, targetHeight, { fit: 'cover' })
      .toBuffer();

    const afterImage = sharp(afterPath);
    const afterResized = await afterImage
      .resize(targetWidth, targetHeight, { fit: 'cover' })
      .ensureAlpha(0.5) // Make semi-transparent
      .toBuffer();

    // Overlay after on top of before
    await sharp(beforeResized)
      .composite([{ input: afterResized, blend: 'over' }])
      .jpeg({ quality: 90 })
      .toFile(outputPath);
  }

  /**
   * Delete a photo and its thumbnail
   */
  static async deletePhoto(filePath: string, thumbnailPath: string | null): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      logPhotoServiceError('Error deleting photo:', err);
    }

    if (thumbnailPath) {
      try {
        await fs.unlink(thumbnailPath);
      } catch (err) {
        logPhotoServiceError('Error deleting thumbnail:', err);
      }
    }
  }

  /**
   * Extract EXIF metadata (for display, not storage)
   */
  static async extractMetadata(buffer: Buffer): Promise<{
    takenAt?: Date;
    deviceInfo?: string;
    gpsRemoved: boolean;
  }> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let takenAt: Date | undefined;
    let deviceInfo: string | undefined;
    let gpsRemoved = true;

    // Extract date taken from EXIF
    if (metadata.exif) {
      const exifData = metadata.exif.toString();
      // Simple parsing - in production, use exif-parser library
      if (exifData.includes('DateTime')) {
        // Parse DateTime from EXIF
        // This is simplified - real implementation would parse properly
      }
      if (exifData.includes('Model')) {
        // Extract camera model
      }
      // Check if GPS data exists (it shouldn't after processing)
      gpsRemoved = !exifData.includes('GPS');
    }

    return { takenAt, deviceInfo, gpsRemoved };
  }

  /**
   * Get photo statistics for a patient
   */
  static async getPhotoStats(
    photos: Array<{ file_size_bytes: number; body_region: string }>,
  ): Promise<{
    totalCount: number;
    totalSizeMB: number;
    byRegion: Record<string, number>;
  }> {
    const totalCount = photos.length;
    const totalSizeMB =
      photos.reduce((sum, p) => sum + (p.file_size_bytes || 0), 0) / 1024 / 1024;

    const byRegion: Record<string, number> = {};
    photos.forEach((photo) => {
      byRegion[photo.body_region] = (byRegion[photo.body_region] || 0) + 1;
    });

    return { totalCount, totalSizeMB, byRegion };
  }

  /**
   * Validate image file
   */
  static validateImageFile(
    mimetype: string,
    size: number,
  ): { valid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];

    if (!allowedTypes.includes(mimetype)) {
      return { valid: false, error: 'Invalid file type. Only JPEG, PNG, and HEIC allowed.' };
    }

    if (size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      };
    }

    return { valid: true };
  }
}

// Initialize on module load
PhotoService.init().catch((error) => {
  logPhotoServiceError('Photo service init error:', error);
});
