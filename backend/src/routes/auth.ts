import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env";
import { issueTokens, rotateRefreshToken } from "../services/authService";
import { userStore } from "../services/userStore";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { authLimiter } from "../middleware/rateLimiter";
import { logger } from "../lib/logger";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1), // Don't validate length on login, only on creation
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const authRouter = Router();

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

function logAuthError(message: string, error: unknown): void {
  logger.error(message, {
    error: toSafeErrorMessage(error),
  });
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate a user with email and password. Returns user info and JWT tokens.
 *     tags:
 *       - Authentication
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Tenant-ID
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID for multi-tenancy
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Missing tenant header or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Login failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Apply rate limiting to login endpoint to prevent brute force attacks
// Uses generous limits (100 attempts/15min) suitable for large practices with many staff
authRouter.post("/login", authLimiter, async (req, res) => {
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
    logAuthError("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     description: Use a refresh token to obtain a new access token and refresh token.
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     responses:
 *       200:
 *         description: Token refresh successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/Tokens'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Apply rate limiting to refresh endpoint - generous for active sessions
authRouter.post("/refresh", rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }), async (req, res) => {
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

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user
 *     description: Retrieve the currently authenticated user's information.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  return res.json({ user: req.user });
});

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: List all users in tenant
 *     description: Retrieve all users for the current tenant.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *       - tenantHeader: []
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.get("/users", requireAuth, async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const users = await userStore.listByTenant(tenantId);
  return res.json({ users: users.map(u => userStore.mask(u)) });
});
