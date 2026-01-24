/**
 * Mock Storage Service
 *
 * In-memory implementation of IStorageService for testing and development.
 * Stores files in memory with simulated signed URLs.
 */

import crypto from "crypto";
import { IStorageService, StorageUploadResult } from "../../types/services";
import { logger } from "../../logger";

export class MockStorageService implements IStorageService {
  private storage: Map<string, { buffer: Buffer; contentType: string }> = new Map();
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:4000/mock-storage") {
    this.baseUrl = baseUrl;
    logger.info("MockStorageService initialized");
  }

  async putObject(buffer: Buffer, contentType: string, originalName: string): Promise<StorageUploadResult> {
    const key = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;

    this.storage.set(key, { buffer, contentType });

    const signedUrl = this.generateSignedUrl(key);

    logger.debug("Mock storage: file uploaded", { key, contentType, size: buffer.length });

    return { key, signedUrl };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    if (!this.storage.has(key)) {
      throw new Error(`Object not found: ${key}`);
    }

    return this.generateSignedUrl(key, expiresInSeconds);
  }

  async fetchObject(key: string): Promise<Buffer> {
    const entry = this.storage.get(key);

    if (!entry) {
      throw new Error(`Object not found: ${key}`);
    }

    logger.debug("Mock storage: file fetched", { key, size: entry.buffer.length });

    return entry.buffer;
  }

  async deleteObject(key: string): Promise<void> {
    const deleted = this.storage.delete(key);

    if (!deleted) {
      logger.warn("Mock storage: delete called on non-existent key", { key });
    } else {
      logger.debug("Mock storage: file deleted", { key });
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  /**
   * Generate a mock signed URL
   */
  private generateSignedUrl(key: string, expiresInSeconds = 300): string {
    const expires = Date.now() + expiresInSeconds * 1000;
    const signature = crypto.createHash("md5").update(`${key}:${expires}`).digest("hex").substring(0, 16);

    return `${this.baseUrl}/${key}?expires=${expires}&sig=${signature}`;
  }

  /**
   * Clear all stored files (for testing)
   */
  clear(): void {
    this.storage.clear();
    logger.debug("Mock storage: cleared all files");
  }

  /**
   * Get count of stored files (for testing)
   */
  getFileCount(): number {
    return this.storage.size;
  }

  /**
   * Get all stored keys (for testing)
   */
  getStoredKeys(): string[] {
    return Array.from(this.storage.keys());
  }
}
