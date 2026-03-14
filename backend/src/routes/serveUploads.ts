import { Router } from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { env } from "../config/env";
import { auditLog } from "../services/audit";
import { pool } from "../db/pool";

const uploadRoot = path.join(process.cwd(), "uploads");
const MAX_UPLOAD_KEY_LENGTH = 255;

function normalizeUploadKey(key: unknown): string | null {
  if (typeof key !== "string") return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > MAX_UPLOAD_KEY_LENGTH) return null;
  const normalized = path.basename(trimmed);
  if (normalized !== trimmed) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) return null;
  return normalized;
}

function signKey(key: string, tenantId: string, actorId: string) {
  return jwt.sign({ key, tenantId, actorId }, env.jwtSecret, { expiresIn: "5m", issuer: env.jwtIssuer });
}

function verifyToken(token: string): { key: string; tenantId: string; actorId: string } | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer,
    }) as any;
    return { key: decoded.key as string, tenantId: decoded.tenantId as string, actorId: decoded.actorId as string };
  } catch {
    return null;
  }
}

async function canAccessUploadKey(tenantId: string, key: string): Promise<boolean> {
  const uploadUrl = `/uploads/${key}`;
  const uploadUrlPattern = `%/uploads/${key}%`;
  const result = await pool.query(
    `SELECT 1
       FROM documents
      WHERE tenant_id = $1
        AND (object_key = $2 OR url = $3 OR url LIKE $4)
     UNION
     SELECT 1
       FROM photos
      WHERE tenant_id = $1
        AND (object_key = $2 OR url = $3 OR url LIKE $4)
     LIMIT 1`,
    [tenantId, key, uploadUrl, uploadUrlPattern],
  );
  return (result.rowCount ?? 0) > 0;
}

export const serveUploadsRouter = Router();

serveUploadsRouter.post("/sign", requireAuth, async (req: AuthedRequest, res) => {
  const rawKey = req.body?.key;
  const key = normalizeUploadKey(rawKey);
  if (!key) {
    return res.status(400).json({ error: "Invalid key" });
  }

  const tenantId = req.user!.tenantId;
  const userId = req.user!.id;
  const allowed = await canAccessUploadKey(tenantId, key);
  if (!allowed) {
    return res.status(403).json({ error: "Not authorized to access requested upload" });
  }

  const token = signKey(key, tenantId, userId);
  res.json({ url: `/api/uploads/${encodeURIComponent(key)}?token=${token}`, token });
});

serveUploadsRouter.get("/:key", async (req, res) => {
  const requestedKey = normalizeUploadKey(req.params.key);
  if (!requestedKey) return res.status(400).json({ error: "Invalid key" });
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const verified = verifyToken(token);
  if (!verified) return res.status(401).json({ error: "Invalid token" });
  if (verified.key !== requestedKey) return res.status(403).json({ error: "Token does not match file key" });
  const safeKey = requestedKey;
  const filePath = path.join(uploadRoot, safeKey);
  if (!filePath.startsWith(uploadRoot)) return res.status(400).json({ error: "Invalid path" });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    stream.pipe(res);
  });
  stream.on("error", () => res.status(500).end());
  // Audit download
  auditLog(verified.tenantId, verified.actorId || "unknown", "file_download", "upload", safeKey).catch(() => undefined);
});
