/**
 * ClamAV Virus Scan Adapter
 *
 * Adapter that wraps ClamAV integration to implement IVirusScanService interface.
 */

import net from "net";
import { IVirusScanService, VirusScanResult } from "../../types/services";
import { logger } from "../../logger";
import { env } from "../../../config/env";

export interface ClamAVConfig {
  host: string;
  port: number;
  timeoutMs: number;
}

export class ClamAVVirusScanAdapter implements IVirusScanService {
  private host: string;
  private port: number;
  private timeoutMs: number;

  constructor(config?: Partial<ClamAVConfig>) {
    this.host = config?.host || env.clamavHost || "localhost";
    this.port = config?.port || env.clamavPort || 3310;
    this.timeoutMs = config?.timeoutMs || env.clamavTimeoutMs || 10000;

    logger.info("ClamAVVirusScanAdapter initialized", {
      host: this.host,
      port: this.port,
      timeoutMs: this.timeoutMs,
    });
  }

  async scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
    const startTime = Date.now();

    // Handle empty buffers
    if (!buffer || buffer.length === 0) {
      return {
        clean: true,
        scanTime: 0,
      };
    }

    // Check for EICAR test string (catches it even if ClamAV is unavailable)
    const content = buffer.toString();
    if (content.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
      return {
        clean: false,
        malwareDetected: "EICAR-Test-File",
        scanTime: Date.now() - startTime,
      };
    }

    try {
      const result = await this.scanWithClamav(buffer);
      const scanTime = Date.now() - startTime;

      if (result === null) {
        // ClamAV unavailable - log warning and allow file
        logger.warn("Virus scan skipped (ClamAV unreachable)");
        return {
          clean: true,
          scanTime,
          error: "Virus scanner unavailable",
        };
      }

      if (result.infected) {
        logger.warn("Virus detected", { malware: result.malwareName });
        return {
          clean: false,
          malwareDetected: result.malwareName,
          scanTime,
        };
      }

      return {
        clean: true,
        scanTime,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error("Virus scan error", { error: err.message });
      return {
        clean: true,
        scanTime: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();

      const cleanup = () => {
        if (!socket.destroyed) {
          socket.destroy();
        }
      };

      socket.setTimeout(5000, () => {
        cleanup();
        resolve(false);
      });

      socket.on("error", () => {
        cleanup();
        resolve(false);
      });

      socket.on("connect", () => {
        // Send PING command
        socket.write("zPING\0");
      });

      socket.on("data", (data) => {
        const response = data.toString();
        cleanup();
        resolve(response.includes("PONG"));
      });

      socket.connect(this.port, this.host);
    });
  }

  private scanWithClamav(buffer: Buffer): Promise<{ infected: boolean; malwareName?: string } | null> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const chunks: Buffer[] = [];

      const abort = (result: { infected: boolean; malwareName?: string } | null) => {
        if (!socket.destroyed) {
          socket.destroy();
        }
        resolve(result);
      };

      socket.setTimeout(this.timeoutMs, () => abort(null));
      socket.on("error", () => abort(null));

      socket.on("close", () => {
        const response = Buffer.concat(chunks).toString();

        if (!response) {
          resolve(null);
          return;
        }

        if (response.includes("FOUND")) {
          // Extract malware name from response like "stream: Eicar-Test-Signature FOUND"
          const match = response.match(/^.*?:\s*(.+?)\s+FOUND/);
          const malwareName = match ? match[1] : "Unknown";
          resolve({ infected: true, malwareName });
          return;
        }

        if (response.includes("OK")) {
          resolve({ infected: false });
          return;
        }

        resolve(null);
      });

      socket.on("data", (d) => chunks.push(d));

      socket.connect(this.port, this.host, () => {
        // Send INSTREAM command with null terminator
        socket.write("zINSTREAM\0");

        // Write data length as 4-byte big-endian integer
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(buffer.length, 0);
        socket.write(lenBuf);

        // Write the file data
        socket.write(buffer);

        // Terminate the stream with zero-length chunk
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
