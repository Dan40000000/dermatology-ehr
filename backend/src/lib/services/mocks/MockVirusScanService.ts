/**
 * Mock Virus Scan Service
 *
 * In-memory implementation of IVirusScanService for testing and development.
 * Simulates virus scanning with configurable responses.
 */

import { IVirusScanService, VirusScanResult } from "../../types/services";
import { logger } from "../../logger";

export class MockVirusScanService implements IVirusScanService {
  private isServiceAvailable = true;
  private simulateMalware = false;
  private malwareName = "TEST-MALWARE";
  private scanDelayMs = 0;

  constructor() {
    logger.info("MockVirusScanService initialized");
  }

  async scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
    const startTime = Date.now();

    // Simulate scan delay
    if (this.scanDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.scanDelayMs));
    }

    // Check for EICAR test string (standard antivirus test pattern)
    const content = buffer.toString();
    const hasEicar = content.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE");

    if (hasEicar || this.simulateMalware) {
      const malwareDetected = hasEicar ? "EICAR-Test-File" : this.malwareName;

      logger.warn("Mock virus scan: malware detected", { malwareDetected });

      return {
        clean: false,
        malwareDetected,
        scanTime: Date.now() - startTime,
      };
    }

    if (!this.isServiceAvailable) {
      logger.warn("Mock virus scan: service unavailable (simulated)");

      return {
        clean: true, // Allow file when scanner unavailable (with warning)
        scanTime: Date.now() - startTime,
        error: "Virus scanner unavailable (simulated)",
      };
    }

    logger.debug("Mock virus scan: file clean", { size: buffer.length });

    return {
      clean: true,
      scanTime: Date.now() - startTime,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.isServiceAvailable;
  }

  // =========================================================================
  // Test Helper Methods
  // =========================================================================

  /**
   * Set service availability (for testing)
   */
  setAvailable(available: boolean): void {
    this.isServiceAvailable = available;
    logger.debug("Mock virus scan: availability set", { available });
  }

  /**
   * Set whether to simulate malware detection (for testing)
   */
  setSimulateMalware(shouldSimulate: boolean, malwareName = "TEST-MALWARE"): void {
    this.simulateMalware = shouldSimulate;
    this.malwareName = malwareName;
    logger.debug("Mock virus scan: malware simulation set", { shouldSimulate, malwareName });
  }

  /**
   * Set scan delay in milliseconds (for testing)
   */
  setScanDelay(delayMs: number): void {
    this.scanDelayMs = delayMs;
    logger.debug("Mock virus scan: delay set", { delayMs });
  }

  /**
   * Reset all settings to defaults (for testing)
   */
  reset(): void {
    this.isServiceAvailable = true;
    this.simulateMalware = false;
    this.malwareName = "TEST-MALWARE";
    this.scanDelayMs = 0;
    logger.debug("Mock virus scan: reset to defaults");
  }
}
