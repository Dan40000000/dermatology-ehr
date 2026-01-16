import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env";
import { issueTokens, rotateRefreshToken } from "../services/authService";
import { userStore } from "../services/userStore";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  try {
    const tenantId = req.header(env.tenantHeader);
    if (!tenantId) {
      return res.status(400).json({ error: `Missing tenant header: ${env.tenantHeader}` });
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }

    const { email, password } = parsed.data;
    const user = await userStore.findByEmailAndTenant(email, tenantId);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokens = await issueTokens(user);
    return res.json({ user: userStore.mask(user), tokens, tenantId });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const rotated = await rotateRefreshToken(parsed.data.refreshToken);
  if (!rotated) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  return res.json(rotated);
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  return res.json({ user: req.user });
});

authRouter.get("/users", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const users = await userStore.listByTenant(tenantId);
  return res.json({ users: users.map(u => userStore.mask(u)) });
});
