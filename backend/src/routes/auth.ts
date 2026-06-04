import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { issueTokens, revokeRefreshToken, revokeRefreshTokensForUser, rotateRefreshToken } from "../services/authService";
import { userStore } from "../services/userStore";
import { AuthedRequest, requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { authLimiter } from "../middleware/rateLimiter";
import { logger } from "../lib/logger";
import { requireRoles } from "../middleware/rbac";
import { validatePasswordPolicy } from "../middleware/security";
import { buildEffectiveRoles } from "../lib/roles";
import {
  clearStaffAuthCookies,
  isCookieAuthPlaceholder,
  publicCookieTokens,
  setStaffAuthCookies,
  STAFF_REFRESH_COOKIE,
} from "../auth/cookies";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1), // Don't validate length on login, only on creation
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export const authRouter = Router();

const WORKFORCE_USER_ROLES = new Set([
  "admin",
  "provider",
  "ma",
  "front_desk",
  "billing",
  "nurse",
  "manager",
  "scheduler",
  "hr",
  "staff",
  "compliance_officer",
]);
const STAFF_LOGIN_LOCK_THRESHOLD = 5;

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

function getRefreshTokenFromRequest(req: AuthedRequest): string | undefined {
  const rawToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken.trim() : "";
  if (rawToken && !isCookieAuthPlaceholder(rawToken)) {
    return rawToken;
  }
  return req.cookies?.[STAFF_REFRESH_COOKIE];
}

function isTruthyQueryFlag(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isTruthyQueryFlag);
  }
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function isWorkforceUser(user: { role?: unknown; roles?: unknown; secondaryRoles?: unknown }): boolean {
  const roles = buildEffectiveRoles(user.role, user.roles || user.secondaryRoles);
  return roles.some((role) => WORKFORCE_USER_ROLES.has(role));
}

function isMissingStaffLockoutColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: string }).code || "") : "";
  const message = "message" in error ? String((error as { message?: string }).message || "") : "";

  return code === "42703" && /(failed_login_attempts|login_locked_at|login_locked_reason|last_failed_login_at)/i.test(message);
}

async function getStaffLoginSecurity(userId: string, tenantId: string): Promise<{
  failedLoginAttempts: number;
  lockedAt: string | null;
} | null> {
  try {
    const result = await pool.query(
      `SELECT COALESCE(failed_login_attempts, 0) as "failedLoginAttempts",
              login_locked_at as "lockedAt"
       FROM users
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      failedLoginAttempts: Number(row.failedLoginAttempts || 0),
      lockedAt: row.lockedAt || null,
    };
  } catch (error) {
    if (isMissingStaffLockoutColumn(error)) {
      logger.warn("Staff login lockout columns are missing; continuing without persistent lockout", {
        userId,
        tenantId,
      });
      return null;
    }
    throw error;
  }
}

async function recordStaffFailedLogin(userId: string, tenantId: string): Promise<{
  failedLoginAttempts: number;
  lockedAt: string | null;
} | null> {
  try {
    const result = await pool.query(
      `UPDATE users
       SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
           last_failed_login_at = CURRENT_TIMESTAMP,
           login_locked_at = CASE
             WHEN COALESCE(failed_login_attempts, 0) + 1 >= $1 THEN COALESCE(login_locked_at, CURRENT_TIMESTAMP)
             ELSE login_locked_at
           END,
           login_locked_reason = CASE
             WHEN COALESCE(failed_login_attempts, 0) + 1 >= $1 THEN 'failed_login_attempts'
             ELSE login_locked_reason
           END
       WHERE id = $2 AND tenant_id = $3
       RETURNING failed_login_attempts as "failedLoginAttempts",
                 login_locked_at as "lockedAt"`,
      [STAFF_LOGIN_LOCK_THRESHOLD, userId, tenantId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      failedLoginAttempts: Number(row.failedLoginAttempts || 0),
      lockedAt: row.lockedAt || null,
    };
  } catch (error) {
    if (isMissingStaffLockoutColumn(error)) {
      logger.warn("Staff login lockout columns are missing; failed attempt was not persisted", {
        userId,
        tenantId,
      });
      return null;
    }
    throw error;
  }
}

async function clearStaffFailedLoginState(userId: string, tenantId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           login_locked_at = NULL,
           login_locked_reason = NULL,
           last_failed_login_at = NULL
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  } catch (error) {
    if (isMissingStaffLockoutColumn(error)) {
      return;
    }
    throw error;
  }
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

    const loginSecurity = await getStaffLoginSecurity(user.id, tenantId);
    if (loginSecurity?.lockedAt) {
      return res.status(423).json({
        error: "Account locked after multiple failed login attempts. An admin must reset this password.",
        locked: true,
        adminResetRequired: true,
      });
    }

    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) {
      const failedState = await recordStaffFailedLogin(user.id, tenantId);
      const failedLoginAttempts = failedState?.failedLoginAttempts ?? 0;
      if (failedState?.lockedAt || failedLoginAttempts >= STAFF_LOGIN_LOCK_THRESHOLD) {
        return res.status(423).json({
          error: "Account locked after multiple failed login attempts. An admin must reset this password.",
          locked: true,
          adminResetRequired: true,
        });
      }

      return res.status(401).json({
        error: "Invalid credentials",
        attemptsRemaining: Math.max(STAFF_LOGIN_LOCK_THRESHOLD - failedLoginAttempts, 0),
      });
    }

    await clearStaffFailedLoginState(user.id, tenantId);
    const tokens = await issueTokens(user);
    setStaffAuthCookies(res, tokens);
    return res.json({ user: userStore.mask(user), tokens: publicCookieTokens(tokens), tenantId });
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
  const refreshToken = getRefreshTokenFromRequest(req);
  if (!refreshToken) {
    return res.status(400).json({ error: "Missing refresh token" });
  }

  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) {
    clearStaffAuthCookies(res);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  setStaffAuthCookies(res, rotated.tokens);
  return res.json({ ...rotated, tokens: publicCookieTokens(rotated.tokens) });
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

authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  try {
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
  } catch (error) {
    logAuthError("Logout refresh revoke error:", error);
  }
  clearStaffAuthCookies(res);
  return res.json({ success: true });
});

authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }

  const passwordValidation = validatePasswordPolicy(parsed.data.newPassword);
  if (!passwordValidation.isValid) {
    return res.status(400).json({
      error: "Password does not meet security requirements",
      details: passwordValidation.errors,
    });
  }

  try {
    const user = await userStore.findById(req.user!.id);
    if (!user || user.tenantId !== req.user!.tenantId) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentMatches = bcrypt.compareSync(parsed.data.currentPassword, user.passwordHash);
    if (!currentMatches) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const samePassword = bcrypt.compareSync(parsed.data.newPassword, user.passwordHash);
    if (samePassword) {
      return res.status(400).json({ error: "New password must be different from current password" });
    }

    const passwordHash = bcrypt.hashSync(parsed.data.newPassword, 12);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           force_password_reset = false,
           password_changed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND tenant_id = $3`,
      [passwordHash, user.id, user.tenantId],
    );

    await revokeRefreshTokensForUser(user.id, user.tenantId);
    const updatedUser = { ...user, passwordHash, forcePasswordReset: false };
    const tokens = await issueTokens(updatedUser);
    setStaffAuthCookies(res, tokens);
    return res.json({ user: userStore.mask(updatedUser), tokens: publicCookieTokens(tokens), tenantId: user.tenantId });
  } catch (error) {
    logAuthError("Change password error:", error);
    return res.status(500).json({ error: "Password change failed" });
  }
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
authRouter.get("/users", requireAuth, requireRoles(["admin", "manager", "compliance_officer"]), async (req: AuthedRequest, res) => {
  const tenantId = req.user!.tenantId;
  const workforceOnly = isTruthyQueryFlag(req.query.workforceOnly) || isTruthyQueryFlag(req.query.staffOnly);
  const users = await userStore.listByTenant(tenantId);
  const visibleUsers = workforceOnly ? users.filter(isWorkforceUser) : users;
  return res.json({ users: visibleUsers.map(u => userStore.mask(u)) });
});
