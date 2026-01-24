/**
 * MockClamAVService - Virus scanning mock for development and testing
 *
 * This mock provides an in-memory implementation of ClamAV virus scanning.
 * By default, all files are considered clean unless:
 * - The buffer contains "EICAR" (standard antivirus test string)
 * - The filename contains "virus" (for easy test triggering)
 *
 * Supports configurable behavior for testing infected file handling.
 *
 * @example
 * ```typescript
 * const mockClamAV = new MockClamAVService();
 * const isClean = await mockClamAV.scanBuffer(buffer);
 * const isAvailable = await mockClamAV.isAvailable();
 * ```
 */

import crypto from "crypto";

/**
 * Configuration options for MockClamAVService
 */
export interface MockClamAVConfig {
  /** Simulated delay in milliseconds for operations (default: 0) */
  simulatedDelay?: number;
  /** Probability of failure (0-1) for chaos testing (default: 0) */
  failureRate?: number;
  /** Whether the service should report as available (default: true) */
  available?: boolean;
  /** Additional patterns to detect as infected */
  additionalInfectedPatterns?: string[];
  /** Additional filename patterns to detect as infected */
  additionalInfectedFilenames?: string[];
  /** Force all scans to return infected (for testing) */
  forceInfected?: boolean;
  /** Force all scans to return clean (for testing) */
  forceClean?: boolean;
}

/**
 * Scan result details
 */
export interface ScanResult {
  clean: boolean;
  virusName?: string;
  scanTime: number;
  fileSize: number;
}

/**
 * Stored scan record for test assertions
 */
export interface StoredScan {
  id: string;
  type: "buffer" | "file";
  filename?: string;
  size: number;
  result: ScanResult;
  timestamp: Date;
}

/**
 * Operation log entry for debugging and test assertions
 */
export interface ClamAVOperationLog {
  operation: "scanBuffer" | "scanFile" | "isAvailable";
  timestamp: Date;
  success: boolean;
  error?: string;
  result?: ScanResult | boolean;
  metadata?: Record<string, any>;
}

/**
 * Known virus signatures for mock detection
 */
const KNOWN_VIRUS_SIGNATURES = [
  { pattern: "EICAR-STANDARD-ANTIVIRUS-TEST-FILE", name: "Eicar-Test-Signature" },
  { pattern: "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR", name: "Eicar-Test-Signature" },
  { pattern: "MALWARE_TEST_SIGNATURE", name: "Test-Malware-Signature" },
];

/**
 * In-memory ClamAV mock service for development and testing
 */
export class MockClamAVService {
  private scans: StoredScan[] = [];
  private operationLog: ClamAVOperationLog[] = [];
  private config: Required<MockClamAVConfig>;

  constructor(config: MockClamAVConfig = {}) {
    this.config = {
      simulatedDelay: config.simulatedDelay ?? 0,
      failureRate: config.failureRate ?? 0,
      available: config.available ?? true,
      additionalInfectedPatterns: config.additionalInfectedPatterns ?? [],
      additionalInfectedFilenames: config.additionalInfectedFilenames ?? [],
      forceInfected: config.forceInfected ?? false,
      forceClean: config.forceClean ?? false,
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
   * Generate a unique scan ID
   */
  private generateId(): string {
    return `scan_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Log an operation for debugging and test assertions
   */
  private logOperation(
    operation: ClamAVOperationLog["operation"],
    success: boolean,
    error?: string,
    result?: ScanResult | boolean,
    metadata?: Record<string, any>
  ): void {
    this.operationLog.push({
      operation,
      timestamp: new Date(),
      success,
      error,
      result,
      metadata,
    });

    const status = success ? "SUCCESS" : "FAILED";
    console.log(`[MockClamAVService] ${operation} - ${status}${error ? `: ${error}` : ""}`);
  }

  /**
   * Check if buffer contains any virus signature
   */
  private detectVirus(buffer: Buffer, filename?: string): { infected: boolean; virusName?: string } {
    // Force clean mode bypasses all checks
    if (this.config.forceClean) {
      return { infected: false };
    }

    // Force infected mode marks everything as infected
    if (this.config.forceInfected) {
      return { infected: true, virusName: "Forced-Test-Detection" };
    }

    // Check filename patterns first (allows filename-based detection even with empty buffer)
    if (filename) {
      const lowerFilename = filename.toLowerCase();

      // Default: detect "virus" in filename
      if (lowerFilename.includes("virus")) {
        return { infected: true, virusName: "Filename-Contains-Virus" };
      }

      // Check additional configured filename patterns
      for (const pattern of this.config.additionalInfectedFilenames) {
        if (lowerFilename.includes(pattern.toLowerCase())) {
          return { infected: true, virusName: `Filename-Pattern-${pattern}` };
        }
      }
    }

    // Empty buffers are considered clean (after filename check)
    if (!buffer || buffer.length === 0) {
      return { infected: false };
    }

    const content = buffer.toString("utf-8", 0, Math.min(buffer.length, 65536));

    // Check known virus signatures
    for (const sig of KNOWN_VIRUS_SIGNATURES) {
      if (content.includes(sig.pattern)) {
        return { infected: true, virusName: sig.name };
      }
    }

    // Check additional configured patterns
    for (const pattern of this.config.additionalInfectedPatterns) {
      if (content.includes(pattern)) {
        return { infected: true, virusName: `Custom-Pattern-${pattern.slice(0, 20)}` };
      }
    }

    return { infected: false };
  }

  /**
   * Scan a buffer for viruses
   *
   * @param buffer - The file content to scan
   * @returns true if clean, false if infected
   */
  async scanBuffer(buffer: Buffer): Promise<boolean> {
    const startTime = Date.now();
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("scanBuffer", false, "Simulated ClamAV failure");
      throw new Error("Simulated ClamAV failure");
    }

    if (!this.config.available) {
      this.logOperation("scanBuffer", false, "ClamAV service unavailable");
      // Return true (allow) when unavailable, matching real service behavior
      return true;
    }

    const detection = this.detectVirus(buffer);
    const scanTime = Date.now() - startTime;

    const result: ScanResult = {
      clean: !detection.infected,
      virusName: detection.virusName,
      scanTime,
      fileSize: buffer.length,
    };

    const scan: StoredScan = {
      id: this.generateId(),
      type: "buffer",
      size: buffer.length,
      result,
      timestamp: new Date(),
    };

    this.scans.push(scan);
    this.logOperation("scanBuffer", true, undefined, result, { size: buffer.length });

    return result.clean;
  }

  /**
   * Scan a file for viruses by filename
   * This is a convenience method that checks the filename pattern
   *
   * @param filename - The filename to check
   * @param buffer - Optional buffer content to also scan
   * @returns true if clean, false if infected
   */
  async scanFile(filename: string, buffer?: Buffer): Promise<boolean> {
    const startTime = Date.now();
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("scanFile", false, "Simulated ClamAV failure", undefined, { filename });
      throw new Error("Simulated ClamAV failure");
    }

    if (!this.config.available) {
      this.logOperation("scanFile", false, "ClamAV service unavailable", undefined, { filename });
      // Return true (allow) when unavailable, matching real service behavior
      return true;
    }

    // Create a minimal buffer if none provided
    const scanBuffer = buffer || Buffer.from("");

    const detection = this.detectVirus(scanBuffer, filename);
    const scanTime = Date.now() - startTime;

    const result: ScanResult = {
      clean: !detection.infected,
      virusName: detection.virusName,
      scanTime,
      fileSize: scanBuffer.length,
    };

    const scan: StoredScan = {
      id: this.generateId(),
      type: "file",
      filename,
      size: scanBuffer.length,
      result,
      timestamp: new Date(),
    };

    this.scans.push(scan);
    this.logOperation("scanFile", true, undefined, result, { filename, size: scanBuffer.length });

    return result.clean;
  }

  /**
   * Check if ClamAV service is available
   *
   * @returns true if available, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    await this.simulateDelay();

    if (this.shouldFail()) {
      this.logOperation("isAvailable", false, "Simulated availability check failure");
      return false;
    }

    this.logOperation("isAvailable", true, undefined, this.config.available);
    return this.config.available;
  }

  // ============================================================
  // Test Helper Methods
  // ============================================================

  /**
   * Get all scan records for test assertions
   */
  getScans(): StoredScan[] {
    return [...this.scans];
  }

  /**
   * Get scans that detected infections
   */
  getInfectedScans(): StoredScan[] {
    return this.scans.filter((s) => !s.result.clean);
  }

  /**
   * Get clean scans
   */
  getCleanScans(): StoredScan[] {
    return this.scans.filter((s) => s.result.clean);
  }

  /**
   * Get the last scan
   */
  getLastScan(): StoredScan | undefined {
    return this.scans[this.scans.length - 1];
  }

  /**
   * Get scan count
   */
  getScanCount(): number {
    return this.scans.length;
  }

  /**
   * Get total bytes scanned
   */
  getTotalBytesScanned(): number {
    return this.scans.reduce((total, scan) => total + scan.size, 0);
  }

  /**
   * Clear all scan records
   */
  clearScans(): void {
    this.scans = [];
    console.log("[MockClamAVService] Scans cleared");
  }

  /**
   * Get all operation logs
   */
  getOperationLog(): ClamAVOperationLog[] {
    return [...this.operationLog];
  }

  /**
   * Clear all operation logs
   */
  clearOperationLog(): void {
    this.operationLog = [];
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.scans = [];
    this.operationLog = [];
    console.log("[MockClamAVService] Full reset completed");
  }

  /**
   * Set service availability
   */
  setAvailable(available: boolean): void {
    this.config.available = available;
  }

  /**
   * Add a custom infected pattern
   */
  addInfectedPattern(pattern: string): void {
    this.config.additionalInfectedPatterns.push(pattern);
  }

  /**
   * Add a custom infected filename pattern
   */
  addInfectedFilenamePattern(pattern: string): void {
    this.config.additionalInfectedFilenames.push(pattern);
  }

  /**
   * Force all future scans to return infected
   */
  setForceInfected(force: boolean): void {
    this.config.forceInfected = force;
    if (force) {
      this.config.forceClean = false;
    }
  }

  /**
   * Force all future scans to return clean
   */
  setForceClean(force: boolean): void {
    this.config.forceClean = force;
    if (force) {
      this.config.forceInfected = false;
    }
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<MockClamAVConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<MockClamAVConfig> {
    return { ...this.config };
  }

  /**
   * Create an EICAR test file buffer (standard antivirus test)
   */
  static createEicarTestBuffer(): Buffer {
    // This is the standard EICAR test string
    const eicarString = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    return Buffer.from(eicarString, "ascii");
  }

  /**
   * Create a clean test file buffer
   */
  static createCleanTestBuffer(size = 1024): Buffer {
    return Buffer.alloc(size, "A");
  }
}

/**
 * Create a pre-configured mock ClamAV service instance
 */
export function createMockClamAVService(config?: MockClamAVConfig): MockClamAVService {
  return new MockClamAVService(config);
}

/**
 * Default singleton instance for simple usage
 */
export const mockClamAVService = new MockClamAVService();
