import { Router } from "express";
import multer from "multer";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { rateLimit } from "../middleware/rateLimit";
import { saveFile } from "../services/storage";

const upload = multer({ storage: multer.memoryStorage() });

export const uploadRouter = Router();

uploadRouter.post("/document", requireAuth, requireRoles(["admin", "provider", "ma"]), rateLimit({ windowMs: 60_000, max: 60 }), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  try {
    const stored = await saveFile(req.file);
    res.json(stored);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

uploadRouter.post("/photo", requireAuth, requireRoles(["admin", "provider", "ma"]), rateLimit({ windowMs: 60_000, max: 60 }), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "Missing file" });
  try {
    const stored = await saveFile(req.file);
    res.json(stored);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});
