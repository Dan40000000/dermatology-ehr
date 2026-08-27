import net from "net";
import { env } from "../config/env";
import { config } from "../config";
import { logger } from "../lib/logger";

async function scanWithClamav(buf: Buffer): Promise<boolean | null> {
  if (!env.clamavHost) return null;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let chunks: Buffer[] = [];

    const abort = (ok: boolean | null) => {
      if (!socket.destroyed) socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(env.clamavTimeoutMs || 10000, () => abort(null));
    socket.on("error", () => abort(null));
    socket.on("close", () => {
      const response = Buffer.concat(chunks).toString();
      if (!response) return abort(null);
      if (response.includes("FOUND")) return abort(false);
      if (response.includes("OK")) return abort(true);
      return abort(null);
    });
    socket.on("data", (d) => chunks.push(d));

    socket.connect(env.clamavPort || 3310, env.clamavHost!, () => {
      socket.write("zINSTREAM\0");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(buf.length, 0);
      socket.write(lenBuf);
      socket.write(buf);
      socket.write(Buffer.alloc(4)); // terminate stream
    });
  });
}

export async function scanBuffer(buf: Buffer): Promise<boolean> {
  const explicitDemo = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DEMO_MODE || process.env.VIRUS_SCAN_DEMO_BYPASS || '').trim().toLowerCase()
  );
  const allowBypass = config.isDevelopment || config.isTest || (explicitDemo && !config.isProductionLike);

  if (!buf || buf.length === 0) return true;

  // Catch obvious test signature early.
  if (buf.toString().includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
    return false;
  }

  const clamResult = await scanWithClamav(buf);
  if (clamResult !== null) {
    return clamResult;
  }

  if (!allowBypass) {
    logger.error("Virus scan unavailable; upload rejected", { reason: 'CLAMAV_UNREACHABLE' });
    return false;
  }

  // Fallback: allow file but log that ClamAV was unavailable.
  logger.warn("Virus scan skipped in synthetic runtime", { reason: 'CLAMAV_UNREACHABLE' });
  return true;
}
