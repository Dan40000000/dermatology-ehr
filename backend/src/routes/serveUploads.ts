import { Router } from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import { auditLog } from "../services/audit";

const uploadRoot = path.join(process.cwd(), "uploads");

function signKey(key: string, tenantId: string, actorId: string) {
  return jwt.sign({ key, tenantId, actorId }, env.jwtSecret, { expiresIn: "5m", issuer: env.jwtIssuer });
}

function verifyToken(token: string): { key: string; tenantId: string; actorId: string } | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as any;
    return { key: decoded.key as string, tenantId: decoded.tenantId as string, actorId: decoded.actorId as string };
  } catch {
    return null;
  }
}

export const serveUploadsRouter = Router();

serveUploadsRouter.post("/sign", requireAuth, async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: "Missing key" });
  const token = signKey(key, req.user!.tenantId, req.user!.id);
  res.json({ url: `/api/uploads/${encodeURIComponent(key)}?token=${token}`, token });
});

serveUploadsRouter.get("/:key", async (req, res) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const verified = verifyToken(token);
  if (!verified) return res.status(401).json({ error: "Invalid token" });
  const safeKey = path.basename(verified.key);
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
