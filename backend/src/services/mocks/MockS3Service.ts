/**
 * MockS3Service - In-memory S3 mock for development and testing
 *
 * This mock provides an in-memory implementation of S3 operations that mimics
 * the real S3 service interface. All objects are stored in a Map and can be
 * retrieved, listed, or deleted. Useful for local development without AWS
 * credentials and for unit/integration testing.
 *
 * @example
 * ```typescript
 * const mockS3 = new MockS3Service({ simulatedDelay: 50 });
 * const { key, signedUrl } = await mockS3.putObject(buffer, 'image/png', 'photo.png');
 * const retrieved = await mockS3.fetchObjectBuffer(key);
 * ```
 */

import crypto from "crypto";

/**
 * Configuration options for MockS3Service
 */
export interface MockS3Config {
  /** Simulated delay in milliseconds for operations (default: 0) */
  simulatedDelay?: number;
  /** Probability of failure (0-1) for chaos testing (default: 0) */
  failureRate?: number;
  /** Custom error message when failure is triggered */
  failureMessage?: string;
  /** Maximum allowed file size in bytes (default: unlimited) */
  maxFileSize?: number;
  /** Mock bucket name for URL generation */
  bucketName?: string;
}

/**
 * Stored object metadata and content
 */
export interface StoredObject {
  key: string;
  buffer: Buffer;
  contentType: string;
  originalName: string;
  createdAt: Date;
  size: number;
  metadata?: Record<string, string>;
}

/**
 * Result from putObject operation
 */
export interface PutObjectResult {
  key: string;
  signedUrl: string;
}

/**
 * Result from listObjects operation
 */
export interface ListObjectsResult {
  objects: Array<{
    key: string;
    size: number;
    contentType: string;
    lastModified: Date;
  }>;
  count: number;
}

/**
 * Operation log entry for debugging and test assertions
 */
export interface S3OperationLog {
  operation: "putObject" | "getSignedObjectUrl" | "fetchObjectBuffer" | "listObjects" | "deleteObject";
  key?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * In-memory S3 mock service for development and testing
 */
export class MockS3Service {
  private storage: Map<string, StoredObject> = new Map();
  private operationLog: S3OperationLog[] = [];
  private config: Required<MockS3Config>;

  constructor(config: MockS3Config = {}) {
    this.config = {
      simulatedDelay: config.simulatedDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      failureMessage: config.failureMessage ?? "Simulated S3 failure",
      maxFileSize: config.maxFileSize ?? Number.MAX_SAFE_INTEGER,
      bucketName: config.bucketName ?? "mock-bucket",
    };
  }

  /**
   * Simulate delay if configured
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.simulatedDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.simulatedDelay));
    }
  }

  /**
   * Check if operation should fail (for chaos testing)
   */
  private shouldFail(): boolean {
    return Math.random() < this.config.failureRate;
  }

  /**
   * Log an operation for debugging and test assertions
   */
  private logOperation(
    operation: S3OperationLog["operation"],
    key: string | undefined,
    success: boolean,
    error?: string,
    metadata?: Record<string, any>
  ): void {
    this.operationLog.push({
      operation,
      key,
      timestamp: new Date(),
      success,
      error,
      metadata,
    });

    // Console log for debugging
    const status = success ? "SUCCESS" : "FAILED";
    console.log(`[MockS3Service] ${operation} ${key ?? ""} - ${status}${error ? `: ${error}` : ""}`);
  }

  /**
   * Store an object in the mock S3
   *
   * @param buffer - The file content as a Buffer
   * @param contentType - MIME type of the content
   * @param originalName - Original filename
   * @param metadata - Optional metadata to attach to the object
   * @returns Object key and signed URL
   */
  async putObject(
    buffer: Buffer,
    contentType: string,
    originalName: string,
    metadata?: Record<string, string>
  ): Promise<PutObjectResult> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("putObject", undefined, false, this.config.failureMessage);
      throw new Error(this.config.failureMessage);
    }

    if (buffer.length > this.config.maxFileSize) {
      const error = `File size ${buffer.length} exceeds maximum allowed size ${this.config.maxFileSize}`;
      this.logOperation("putObject", undefined, false, error);
      throw new Error(error);
    }

    const key = `${Date.now()}-${crypto.randomUUID()}-${originalName}`;

    const storedObject: StoredObject = {
      key,
      buffer,
      contentType,
      originalName,
      createdAt: new Date(),
      size: buffer.length,
      metadata,
    };

    this.storage.set(key, storedObject);

    // Generate a mock signed URL (data URL for small files, mock URL for large files)
    const signedUrl = this.generateMockSignedUrl(key, buffer, contentType);

    this.logOperation("putObject", key, true, undefined, {
      size: buffer.length,
      contentType,
      originalName,
    });

    return { key, signedUrl };
  }

  /**
   * Generate a signed URL for an object
   *
   * @param key - The object key
   * @param expiresInSeconds - URL expiration time (default: 300)
   * @returns Signed URL string
   */
  async getSignedObjectUrl(key: string, expiresInSeconds = 300): Promise<string> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("getSignedObjectUrl", key, false, this.config.failureMessage);
      throw new Error(this.config.failureMessage);
    }

    const obj = this.storage.get(key);
    if (!obj) {
      const error = `Object not found: ${key}`;
      this.logOperation("getSignedObjectUrl", key, false, error);
      throw new Error(error);
    }

    const signedUrl = this.generateMockSignedUrl(key, obj.buffer, obj.contentType, expiresInSeconds);

    this.logOperation("getSignedObjectUrl", key, true, undefined, { expiresInSeconds });

    return signedUrl;
  }

  /**
   * Retrieve an object's content as a Buffer
   *
   * @param key - The object key
   * @returns Buffer containing the object content
   */
  async fetchObjectBuffer(key: string): Promise<Buffer> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("fetchObjectBuffer", key, false, this.config.failureMessage);
      throw new Error(this.config.failureMessage);
    }

    const obj = this.storage.get(key);
    if (!obj) {
      const error = `Object not found: ${key}`;
      this.logOperation("fetchObjectBuffer", key, false, error);
      throw new Error(error);
    }

    this.logOperation("fetchObjectBuffer", key, true, undefined, { size: obj.size });

    return obj.buffer;
  }

  /**
   * List all objects in the mock S3
   *
   * @param prefix - Optional prefix to filter objects
   * @param maxKeys - Maximum number of objects to return (default: 1000)
   * @returns List of object metadata
   */
  async listObjects(prefix?: string, maxKeys = 1000): Promise<ListObjectsResult> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("listObjects", prefix, false, this.config.failureMessage);
      throw new Error(this.config.failureMessage);
    }

    let objects = Array.from(this.storage.values());

    if (prefix) {
      objects = objects.filter((obj) => obj.key.startsWith(prefix));
    }

    objects = objects.slice(0, maxKeys);

    const result: ListObjectsResult = {
      objects: objects.map((obj) => ({
        key: obj.key,
        size: obj.size,
        contentType: obj.contentType,
        lastModified: obj.createdAt,
      })),
      count: objects.length,
    };

    this.logOperation("listObjects", prefix, true, undefined, {
      prefix,
      count: result.count,
    });

    return result;
  }

  /**
   * Delete an object from the mock S3
   *
   * @param key - The object key to delete
   * @returns true if object was deleted, false if it didn't exist
   */
  async deleteObject(key: string): Promise<boolean> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("deleteObject", key, false, this.config.failureMessage);
      throw new Error(this.config.failureMessage);
    }

    const existed = this.storage.has(key);
    this.storage.delete(key);

    this.logOperation("deleteObject", key, true, undefined, { existed });

    return existed;
  }

  /**
   * Generate a mock signed URL
   * For small files (< 64KB), returns a data URL
   * For larger files, returns a mock HTTPS URL
   */
  private generateMockSignedUrl(
    key: string,
    buffer: Buffer,
    contentType: string,
    expiresInSeconds = 300
  ): string {
    // For small files, use data URL for easy debugging
    if (buffer.length < 65536) {
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    }

    // For larger files, return a mock URL
    const expires = Date.now() + expiresInSeconds * 1000;
    const signature = crypto.randomBytes(16).toString("hex");
    return `https://${this.config.bucketName}.s3.mock.amazonaws.com/${key}?X-Amz-Expires=${expiresInSeconds}&X-Amz-Signature=${signature}&expires=${expires}`;
  }

  // ============================================================
  // Test Helper Methods
  // ============================================================

  /**
   * Get all operation logs for test assertions
   */
  getOperationLog(): S3OperationLog[] {
    return [...this.operationLog];
  }

  /**
   * Get operations filtered by type
   */
  getOperationsByType(operation: S3OperationLog["operation"]): S3OperationLog[] {
    return this.operationLog.filter((log) => log.operation === operation);
  }

  /**
   * Clear all operation logs
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }

  /**
   * Get a stored object directly (for test assertions)
   */
  getStoredObject(key: string): StoredObject | undefined {
    return this.storage.get(key);
  }

  /**
   * Get all stored object keys
   */
  getStoredKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Get total storage size in bytes
   */
  getTotalStorageSize(): number {
    let total = 0;
    for (const obj of this.storage.values()) {
      total += obj.size;
    }
    return total;
  }

  /**
   * Clear all stored objects (reset for tests)
   */
  clearStorage(): void {
    this.storage.clear();
    console.log("[MockS3Service] Storage cleared");
  }

  /**
   * Reset all state (storage and logs)
   */
  reset(): void {
    this.storage.clear();
    this.operationLog = [];
    console.log("[MockS3Service] Full reset completed");
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<MockS3Config>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MockS3Config> {
    return { ...this.config };
  }
}

/**
 * Create a pre-configured mock S3 service instance
 */
export function createMockS3Service(config?: MockS3Config): MockS3Service {
  return new MockS3Service(config);
}

/**
 * Default singleton instance for simple usage
 */
export const mockS3Service = new MockS3Service();
